import { randomInt } from 'node:crypto';

import { type PlayerId, type PublicView, startingLife } from '@shared/game';
import {
  CodeError,
  extractCode,
  parseJoinLink,
  type SessionDescription,
  unpackDescription,
} from '@shared/net/codec';
import {
  guestSeats,
  idleNetState,
  type NetCommand,
  type NetConfig,
  type NetPhase,
  type NetReport,
  type NetState,
  parseNetReport,
  type SeatState,
} from '@shared/net/lobby';
import {
  cleanLogText,
  encodeNetMessage,
  HOST_SEAT,
  MAX_MESSAGE_BYTES,
  type NetMessage,
  type NetPayload,
  type PeerInfo,
  parseNetMessage,
  parseRollRequest,
  PROTOCOL_VERSION,
  type RollRequest,
  type RollResult,
  type RosterEntry,
  VersionError,
} from '@shared/net/protocol';
import {
  type OpponentState,
  type RemotePeer,
  RemoteViews,
} from '@shared/net/remoteViews';
import type { DeckFormat } from '@shared/types/decks';

import type { RequestHandlers } from '../../ipc';
import { fakePeers, MIRROR_SEAT, mirroredView } from './fakeOpponents';

// Where the peer connections actually live (a hidden renderer window).
export interface Transport {
  // Resolves false if the transport went away while starting.
  open(): Promise<boolean>;
  send(command: NetCommand): void;
  // Lets queued commands flush, then shuts the transport down; the next
  // open() starts a fresh one.
  retire(): void;
}

export interface NetplayDeps {
  transport: Transport;
  config: NetConfig;
  appVersion: string;
  profile(): { playerId: string; displayName: string };
  localView(): PublicView | null;
  // The local game's format, so fake opponents start on its life total.
  localFormat?(): DeckFormat;
  pushState(state: NetState): void;
  pushOpponent(state: OpponentState): void;
  // How long the host waits for a channel after pasting a reply.
  connectTimeoutMs?: number;
  // An integer in [0, max).
  randomInt?(max: number): number;
}

type NetplayHandlers = Pick<
  RequestHandlers,
  | 'getNetState'
  | 'netHost'
  | 'netInvite'
  | 'netAcceptReply'
  | 'netCloseSeat'
  | 'netJoin'
  | 'netLeave'
  | 'netResend'
  | 'netRoll'
  | 'netReport'
  | 'getOpponentView'
>;

// A guest link as the host keeps it.
interface Seat {
  seat: number;
  phase: SeatState['phase'];
  invite: string | null;
  open: boolean;
  // Bound by the first hello; every later message must be from them.
  playerId: PlayerId | null;
  // Their latest hello and public view, verbatim, for players who join
  // later.
  hello: string | null;
  public: string | null;
  error: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const NO_ROUTE =
  'Could not find a route between you. One of you is probably behind a ' +
  'restrictive network: try again on the same Wi-Fi, or over a VPN.';

const versionMismatch = (version: unknown) =>
  `Version mismatch: the other player's MTG Play Mat speaks protocol ` +
  `${JSON.stringify(version)}, this one speaks ${PROTOCOL_VERSION}. ` +
  'Both of you need the same version of the app.';

const describeCodeError = (err: unknown, fallback: string) =>
  err instanceof CodeError ? err.message : fallback;

const emptySeat = (seat: number): Seat => ({
  seat,
  phase: 'empty',
  invite: null,
  open: false,
  playerId: null,
  hello: null,
  public: null,
  error: null,
  timer: null,
});

const roll = (request: RollRequest, random: (max: number) => number) =>
  (request.type === 'die'
    ? {
        type: 'die',
        sides: request.sides,
        result: random(request.sides) + 1,
      }
    : {
        type: 'coin',
        result: random(2) === 0 ? 'heads' : 'tails',
      }) as RollResult;

const listNames = (names: string[]) => names.join(', ');

// Fixed, so the same fake pod comes back every time it is asked for.
const FAKE_SEED = 20_260_921;

// The lobby and the wire protocol. Main is the hub: local view changes go
// out through the transport, and peer messages come back here, are
// checked, and only then reach the board. A pod is a star: guests link to
// the host only, and the host relays what each guest says to the others.
export default class Netplay {
  private state: NetState = idleNetState;

  private readonly remote: RemoteViews;

  private seats = new Map<number, Seat>();

  // Guest: the link to the host is open.
  private hostOpen = false;

  // Guest: the host is whoever says hello first on the link.
  private hostId: PlayerId | null = null;

  private seq = 0;

  private eventId = 0;

  // Who last left, shown before the status until someone new joins.
  private notice: string | null = null;

  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  // Bumped on every new session, so late async work from an old one is
  // ignored.
  private session = 0;

  // Synthetic opponents for testing pod layouts. Built once per count
  // because each one runs the game engine, and never while a session is
  // live, so they cannot reach the wire or a roster.
  private fakes: RemotePeer[] = [];

  // The starting life the fake seats were dealt, so a play test opened
  // in another format can re-deal them on its own.
  private fakeLife: number | null = null;

  // Added to the snapshot's seq so a change in the fake pod alone still
  // moves it forward for the board.
  private fakeRev = 0;

  constructor(private readonly deps: NetplayDeps) {
    this.remote = new RemoteViews(() => this.deps.profile().playerId);
  }

  readonly handlers: NetplayHandlers = {
    getNetState: () => this.state,
    netHost: () => this.host(),
    netInvite: (seat: unknown) => this.invite(seat),
    netAcceptReply: (seat: unknown, code: unknown) =>
      this.acceptReply(seat, code),
    netCloseSeat: (seat: unknown) => this.closeSeat(seat),
    netJoin: (code: unknown) => this.join(code),
    netLeave: () => this.leave(),
    netResend: () => this.resend(),
    netRoll: (request: unknown) => this.roll(request),
    netReport: (input: unknown) => {
      const report = parseNetReport(input);
      if (report) this.handleReport(report);
    },
    getOpponentView: () => this.opponentState(),
  };

  get netState(): NetState {
    return this.state;
  }

  get opponentCount(): number {
    return this.remote.connectedPeers.length + this.fakes.length;
  }

  get fakeOpponents(): number {
    return this.fakes.length;
  }

  // Dev-only: populates the board with synthetic opponents. Refused
  // outright while a session is live, so a real pod never sees them.
  setFakeOpponents = (count: number): boolean => {
    if (this.state.role !== null || this.state.phase !== 'idle') return false;
    const life = this.localLife();
    const next = fakePeers(count, FAKE_SEED, life);
    if (next.length === 0 && this.fakes.length === 0) return true;
    this.fakeLife = life;
    this.fakes = next;
    this.mirrorLocal(this.deps.localView());
    this.fakeRev += 1;
    this.pushOpponent();
    return true;
  };

  // The net window crashed: every link went with it.
  transportLost = () => {
    if (this.state.role === 'guest') {
      this.handleReport({ type: 'closed', seat: HOST_SEAT });
    } else if (this.state.role === 'host') {
      this.seats.forEach((seat) => {
        if (seat.phase !== 'empty') this.dropSeat(seat, 'lost the connection.');
      });
    }
  };

  // An invite from a mtgplaymat:// link waits in the lobby until the user
  // joins with it; it never connects on its own.
  receiveLink = (link: string): boolean => {
    const code = parseJoinLink(link);
    if (!code) return false;
    this.update({ pendingInvite: code });
    return true;
  };

  localViewChanged = (view: PublicView | null) => {
    this.send({ kind: 'public', view });
    const redealt = this.redealFakes();
    if (this.mirrorLocal(view) || redealt) {
      this.fakeRev += 1;
      this.pushOpponent();
    }
  };

  private localLife = () =>
    startingLife(this.deps.localFormat?.() ?? 'constructed');

  // A play test opened in another format starts on another life total,
  // and the fake seats were dealt for the old one. Only the generated
  // seats are re-dealt: the mirror carries the local board as it is.
  private redealFakes = (): boolean => {
    const life = this.localLife();
    if (this.fakes.length === 0 || life === this.fakeLife) return false;
    this.fakeLife = life;
    const next = fakePeers(this.fakes.length, FAKE_SEED, life);
    this.fakes = this.fakes.map((peer, index) =>
      index === MIRROR_SEAT ? peer : (next[index] ?? peer)
    );
    return true;
  };

  // The mirror seat carries the local board so the player can see how
  // their own layout reads from across the table. Only the view is
  // copied: the seat keeps its own identity, and nothing is re-dealt.
  private mirrorLocal = (view: PublicView | null): boolean => {
    const seat = this.fakes[MIRROR_SEAT];
    if (!seat) return false;
    const mirrored = { ...seat, view: mirroredView(view) };
    this.fakes = this.fakes.map((peer, index) =>
      index === MIRROR_SEAT ? mirrored : peer
    );
    return true;
  };

  // A line of the local player's action log: onto the local table log,
  // and to everyone in the pod.
  localLogEntry = (input: string) => {
    const text = cleanLogText(input);
    if (!text) return;
    const { playerId, displayName } = this.deps.profile();
    this.remote.addAction(playerId, displayName, text);
    this.pushOpponent();
    this.send({ kind: 'log', text });
  };

  host = async () => {
    const session = this.reset({ role: 'host', status: 'Gathering routes…' });
    this.seats = new Map(guestSeats.map((seat) => [seat, emptySeat(seat)]));
    this.remote.setRoster(this.roster());
    this.update({ players: this.roster() });
    if (!(await this.deps.transport.open()) || session !== this.session) {
      return;
    }
    this.startInvite(guestSeats[0]);
  };

  // Host: a fresh invite for an empty seat, e.g. for a third player or
  // for someone rejoining.
  invite = async (input: unknown) => {
    const seat = this.hostSeat(input);
    if (!seat || seat.phase !== 'empty') return;
    const session = this.session;
    this.updateSeat(seat, { phase: 'creatingInvite', error: null });
    // Starts a new net window if the old one went away.
    if (!(await this.deps.transport.open()) || session !== this.session) {
      return;
    }
    this.startInvite(seat.seat);
  };

  acceptReply = async (seatInput: unknown, input: unknown) => {
    const seat = this.hostSeat(seatInput);
    if (!seat || seat.phase !== 'awaitingReply') return;
    const session = this.session;
    const code = typeof input === 'string' ? extractCode(input) : '';
    const desc = await this.check(code, 'answer', seat);
    if (!desc || session !== this.session || seat.phase !== 'awaitingReply') {
      return;
    }

    this.updateSeat(seat, { phase: 'connecting', error: null });
    this.deps.transport.send({ op: 'acceptReply', seat: seat.seat, code });
    this.clearSeatTimer(seat);
    seat.timer = setTimeout(() => {
      if (session === this.session && seat.phase === 'connecting') {
        this.updateSeat(seat, { phase: 'awaitingReply', error: NO_ROUTE });
      }
    }, this.deps.connectTimeoutMs ?? 30_000);
  };

  // Host: drops whoever is in the seat (or the pending invite).
  closeSeat = (input: unknown) => {
    const seat = this.hostSeat(input);
    if (!seat || seat.phase === 'empty') return;
    this.dropSeat(seat, null);
  };

  join = async (input: unknown) => {
    const code = typeof input === 'string' ? extractCode(input) : '';
    const desc = await this.check(code, 'offer');
    if (!desc) return;

    const session = this.reset({
      role: 'guest',
      phase: 'creatingReply',
      status: 'Gathering routes…',
      pendingInvite: null,
    });
    if (!(await this.deps.transport.open()) || session !== this.session) {
      return;
    }
    this.deps.transport.send({ op: 'join', code, config: this.deps.config });
  };

  leave = () => {
    this.send({ kind: 'bye' });
    this.reset({});
  };

  resend = () => {
    this.send({ kind: 'hello', ...this.helloInfo() });
    this.send({ kind: 'public', view: this.deps.localView() });
    // The roster carries the host's name too.
    if (this.state.role === 'host') this.sendRoster();
  };

  // Dice and coins are rolled by the host, so nobody rolls their own.
  // Outside a pod the roll is simply local.
  roll = (input: unknown) => {
    let request: RollRequest;
    try {
      request = parseRollRequest(input);
    } catch {
      return;
    }
    if (this.state.role === 'guest') {
      if (this.hostOpen) this.send({ kind: 'roll', request });
      return;
    }
    const { playerId, displayName } = this.deps.profile();
    this.rollFor(playerId, displayName, request);
  };

  handleReport = (report: NetReport) => {
    if (this.state.role === 'host') {
      this.handleHostReport(report);
    } else if (this.state.role === 'guest' && report.seat === HOST_SEAT) {
      this.handleGuestReport(report);
    }
  };

  private handleHostReport = (report: NetReport) => {
    const seat = this.seats.get(report.seat);
    if (!seat) return;
    switch (report.type) {
      case 'invite':
        if (seat.phase === 'creatingInvite') {
          this.updateSeat(seat, {
            phase: 'awaitingReply',
            invite: report.code,
          });
        }
        return;
      case 'open':
        seat.open = true;
        this.clearSeatTimer(seat);
        this.updateSeat(seat, { phase: 'connected', error: null });
        this.send({ kind: 'hello', ...this.helloInfo() }, [seat.seat]);
        this.send({ kind: 'public', view: this.deps.localView() }, [seat.seat]);
        return;
      case 'message':
        if (seat.open) this.receiveFromSeat(seat, report.data);
        return;
      case 'connection':
        if (report.state === 'failed') {
          if (seat.open) this.dropSeat(seat, 'lost the connection.');
          else if (seat.phase === 'connecting') {
            this.clearSeatTimer(seat);
            this.updateSeat(seat, { phase: 'awaitingReply', error: NO_ROUTE });
          }
        }
        return;
      case 'closed':
        if (seat.open) this.dropSeat(seat, 'left the game.');
        return;
      case 'error':
        if (seat.phase === 'connecting') {
          this.clearSeatTimer(seat);
          this.updateSeat(seat, {
            phase: 'awaitingReply',
            error: report.message,
          });
        } else if (seat.phase === 'creatingInvite') {
          this.updateSeat(seat, { phase: 'empty', error: report.message });
        } else {
          this.updateSeat(seat, { error: report.message });
        }
        return;
      default:
        return;
    }
  };

  private handleGuestReport = (report: NetReport) => {
    switch (report.type) {
      case 'reply':
        this.update({
          reply: report.code,
          phase: 'awaitingHost',
          status: 'Send this reply back to the host, then wait to connect.',
        });
        return;
      case 'open':
        this.hostOpen = true;
        this.update({
          phase: 'connected',
          status: 'Connected. Waiting for the host to say hello…',
          error: null,
        });
        this.resend();
        return;
      case 'message':
        if (this.hostOpen) this.receiveFromHost(report.data);
        return;
      case 'connection':
        if (report.state === 'failed') {
          this.end('The connection failed.', NO_ROUTE);
        } else if (report.state === 'disconnected' && this.hostOpen) {
          this.update({ status: 'Connection interrupted, reconnecting…' });
        } else if (report.state === 'connected' && this.hostOpen) {
          this.update({ status: this.connectedStatus() });
        }
        return;
      case 'closed':
        this.end('Lost the connection to the host. The pod has ended.');
        return;
      case 'error':
        if (this.state.phase === 'creatingReply') {
          this.update({ phase: 'ended', status: '', error: report.message });
        } else {
          this.update({ error: report.message });
        }
        return;
      default:
        return;
    }
  };

  private parse = (raw: string, onVersion: (err: VersionError) => void) => {
    try {
      return parseNetMessage(raw);
    } catch (err) {
      if (err instanceof VersionError) onVersion(err);
      else console.warn('[netplay] dropped message', String(err));
      return null;
    }
  };

  // Host side. A guest speaks only for the player bound to its link, so
  // nobody can pass themselves off as someone else in the pod.
  private receiveFromSeat = (seat: Seat, raw: string) => {
    const message = this.parse(raw, (err) =>
      this.rejectSeat(seat, versionMismatch(err.version))
    );
    if (!message) return;

    if (!seat.playerId) {
      if (message.kind !== 'hello') return;
      const taken =
        message.from === this.deps.profile().playerId ||
        [...this.seats.values()].some((s) => s.playerId === message.from);
      if (taken) {
        this.rejectSeat(seat, 'That player is already in the pod.');
        return;
      }
      seat.playerId = message.from;
    } else if (message.from !== seat.playerId) {
      console.warn('[netplay] dropped message sent as another player');
      return;
    }

    switch (message.kind) {
      case 'hello': {
        const first = seat.hello === null;
        if (first) this.notice = null;
        this.remote.receive(message);
        seat.hello = raw;
        this.updateSeat(seat, { player: this.remote.peer(message.from) });
        this.sendRoster();
        // A newcomer learns about everyone already here.
        if (first) {
          const others = this.otherSeats(seat);
          const backlog = others.flatMap((s) => [s.hello, s.public]);
          backlog.forEach((data) => data && this.sendRaw(data, [seat.seat]));
        }
        this.relay(raw, seat);
        this.pushOpponent();
        return;
      }
      case 'public':
        if (!this.remote.receive(message)) return;
        seat.public = raw;
        this.relay(raw, seat);
        this.pushOpponent();
        return;
      case 'log':
        if (!this.remote.receive(message)) return;
        this.relay(raw, seat);
        this.pushOpponent();
        return;
      case 'bye':
        this.relay(raw, seat);
        this.dropSeat(seat, 'left the game.');
        return;
      case 'roll': {
        const name = this.remote.peer(message.from)?.name ?? 'Someone';
        this.rollFor(message.from, name, message.request);
        return;
      }
      default:
        // Rosters and results come from the host alone.
        return;
    }
  };

  private receiveFromHost = (raw: string) => {
    const message = this.parse(raw, (err) =>
      this.end('Could not join the pod.', versionMismatch(err.version))
    );
    if (!message) return;
    if (message.from === this.deps.profile().playerId) return;
    if (!this.hostId && message.kind === 'hello') this.hostId = message.from;
    const fromHost = message.from === this.hostId;

    switch (message.kind) {
      case 'roster': {
        if (!fromHost) return;
        const dropped = this.remote.setRoster(message.players);
        if (dropped.length > 0) {
          this.notice = `${listNames(dropped.map((p) => p.name))} left the game.`;
        }
        this.pushOpponent();
        this.update({
          players: message.players,
          status: this.connectedStatus(),
        });
        return;
      }
      case 'event':
        if (!fromHost) return;
        this.remote.addEvent({
          id: message.id,
          by: message.by,
          byName: message.byName,
          roll: message.roll,
        });
        this.pushOpponent();
        return;
      case 'log':
        if (this.remote.receive(message)) this.pushOpponent();
        return;
      case 'hello':
      case 'public':
      case 'bye': {
        const name = this.remote.peer(message.from)?.name;
        if (!this.remote.receive(message)) return;
        this.pushOpponent();
        if (message.kind === 'hello') {
          if (!name) this.notice = null;
          this.update({ status: this.connectedStatus() });
        } else if (message.kind === 'bye' && fromHost) {
          this.end(
            `The host (${name ?? 'host'}) left the game. The pod has ended.`
          );
        } else if (message.kind === 'bye') {
          this.notice = `${name ?? 'A player'} left the game.`;
          this.update({ status: this.connectedStatus() });
        }
        return;
      }
      default:
        return;
    }
  };

  private rollFor = (by: PlayerId, byName: string, request: RollRequest) => {
    this.eventId += 1;
    const event = {
      id: this.eventId,
      by,
      byName,
      roll: roll(request, this.deps.randomInt ?? randomInt),
    };
    this.remote.addEvent(event);
    this.pushOpponent();
    if (this.state.role === 'host') this.send({ kind: 'event', ...event });
  };

  // Seats that have said hello; they are the pod.
  private boundSeats = () =>
    [...this.seats.values()].filter((s) => s.open && s.playerId);

  private otherSeats = (seat: Seat) =>
    this.boundSeats().filter((s) => s !== seat);

  private roster = (): RosterEntry[] => {
    const { playerId, displayName } = this.deps.profile();
    return [
      { playerId, name: displayName, seat: HOST_SEAT },
      ...this.boundSeats().map((s) => ({
        playerId: s.playerId as PlayerId,
        name: this.remote.peer(s.playerId as PlayerId)?.name ?? 'Player',
        seat: s.seat,
      })),
    ];
  };

  private sendRoster = () => {
    const players = this.roster();
    this.remote.setRoster(players);
    this.state = { ...this.state, players };
    this.send(
      { kind: 'roster', players },
      this.boundSeats().map((s) => s.seat)
    );
    this.refreshHost();
  };

  // Passes a guest's message on unchanged, so every receiver can check
  // who sent it and in what order.
  private relay = (raw: string, origin: Seat) => {
    const seats = this.otherSeats(origin).map((s) => s.seat);
    if (seats.length > 0) this.sendRaw(raw, seats);
  };

  // Host: someone left or dropped; the others hear it through the roster.
  private dropSeat = (seat: Seat, reason: string | null) => {
    const name = seat.playerId
      ? this.remote.peer(seat.playerId)?.name
      : undefined;
    this.deps.transport.send({ op: 'close', seat: seat.seat });
    this.clearSeatTimer(seat);
    const wasBound = seat.playerId !== null;
    if (seat.playerId) this.remote.remove(seat.playerId);
    this.seats.set(seat.seat, emptySeat(seat.seat));
    if (reason && name) this.notice = `${name} ${reason}`;
    if (wasBound) this.sendRoster();
    this.pushOpponent();
    this.refreshHost();
  };

  private rejectSeat = (seat: Seat, error: string) => {
    this.dropSeat(seat, null);
    this.updateSeat(this.seats.get(seat.seat) as Seat, { error });
  };

  private startInvite = (seatNumber: number) => {
    const seat = emptySeat(seatNumber);
    seat.phase = 'creatingInvite';
    this.seats.set(seatNumber, seat);
    this.refreshHost();
    this.deps.transport.send({
      op: 'host',
      seat: seatNumber,
      config: this.deps.config,
    });
  };

  private hostSeat = (input: unknown): Seat | null =>
    this.state.role === 'host' && typeof input === 'number'
      ? (this.seats.get(input) ?? null)
      : null;

  private send = (payload: NetPayload, to?: number[]) => {
    const seats = to ?? this.linkSeats();
    if (seats.length === 0) return;
    const { playerId } = this.deps.profile();
    this.seq += 1;
    const message = {
      v: PROTOCOL_VERSION,
      seq: this.seq,
      from: playerId,
      ...payload,
    } as NetMessage;
    const data = encodeNetMessage(message);
    if (data.length > MAX_MESSAGE_BYTES) {
      console.error('[netplay] message too large to send', data.length);
      return;
    }
    this.sendRaw(data, seats);
  };

  private sendRaw = (data: string, seats: number[]) => {
    this.deps.transport.send({ op: 'send', seats, data });
  };

  // Where this player's own messages go: every open guest link, or the
  // host.
  private linkSeats = (): number[] => {
    if (this.state.role === 'host') {
      return [...this.seats.values()].filter((s) => s.open).map((s) => s.seat);
    }
    return this.state.role === 'guest' && this.hostOpen ? [HOST_SEAT] : [];
  };

  private helloInfo = () => {
    const { playerId, displayName } = this.deps.profile();
    return { playerId, name: displayName, appVersion: this.deps.appVersion };
  };

  private connectedStatus = () => {
    const names = this.remote.connectedPeers.map((p: PeerInfo) => p.name);
    const status =
      names.length > 0 ? `Connected to ${listNames(names)}.` : 'Connected.';
    return this.notice ? `${this.notice} ${status}` : status;
  };

  private check = async (
    code: string,
    expected: SessionDescription['type'],
    seat?: Seat
  ): Promise<SessionDescription | null> => {
    try {
      const desc = await unpackDescription(code);
      if (desc.type !== expected) {
        throw new CodeError(
          expected === 'answer'
            ? 'That is an invite, not a reply. Paste the reply your ' +
                'opponent sent back.'
            : 'That is a reply, not an invite. To join, paste the invite ' +
                'the host sent you.'
        );
      }
      return desc;
    } catch (err) {
      const error = describeCodeError(err, 'That code is not valid.');
      if (seat) this.updateSeat(seat, { error });
      else this.update({ error });
      return null;
    }
  };

  // Guest: the pod is over for us.
  private end = (status: string, error: string | null = null) => {
    // The first reason wins: a goodbye is followed by the channel closing.
    if (this.state.phase === 'idle' || this.state.phase === 'ended') return;
    this.hostOpen = false;
    this.clearConnectTimer();
    if (this.remote.clear()) this.pushOpponent();
    this.update({ phase: 'ended', status, error, players: [] });
  };

  // Every new session (and leaving) starts from a fresh transport.
  private reset = (next: Partial<NetState>): number => {
    this.deps.transport.send({ op: 'leave' });
    this.deps.transport.retire();
    this.session += 1;
    this.hostOpen = false;
    this.hostId = null;
    this.seq = 0;
    this.eventId = 0;
    this.notice = null;
    this.clearConnectTimer();
    this.seats.forEach((seat) => this.clearSeatTimer(seat));
    this.seats = new Map();
    const hadFakes = this.clearFakes();
    if (this.remote.clear() || hadFakes) this.pushOpponent();
    this.state = {
      ...idleNetState,
      pendingInvite: this.state.pendingInvite,
      ...next,
    };
    this.deps.pushState(this.state);
    return this.session;
  };

  private clearConnectTimer = () => {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  };

  private clearSeatTimer = (seat: Seat) => {
    if (seat.timer) clearTimeout(seat.timer);
    seat.timer = null;
  };

  private updateSeat = (seat: Seat, next: Partial<SeatState>) => {
    Object.assign(seat, next);
    this.refreshHost();
  };

  // The host's lobby phase and status follow from its seats.
  private refreshHost = () => {
    if (this.state.role !== 'host') return;
    const seats = [...this.seats.values()].sort((a, b) => a.seat - b.seat);
    const has = (phase: SeatState['phase']) =>
      seats.some((s) => s.phase === phase);
    let phase: NetPhase = 'creatingInvite';
    if (has('connected')) phase = 'connected';
    else if (has('connecting')) phase = 'connecting';
    else if (has('awaitingReply')) phase = 'awaitingReply';

    let status = this.notice ? `${this.notice} ` : '';
    if (phase === 'connected') status = this.connectedStatus();
    else if (phase === 'connecting') status += 'Connecting…';
    else if (phase === 'awaitingReply') {
      status += 'Send an invite to each player, then paste their reply.';
    } else if (has('creatingInvite')) status += 'Gathering routes…';
    else status += 'Invite players to a seat.';

    this.update({
      phase,
      status,
      seats: seats.map((s) => ({
        seat: s.seat,
        phase: s.phase,
        invite: s.invite,
        player: s.playerId ? this.remote.peer(s.playerId) : null,
        error: s.error,
      })),
    });
  };

  private update = (next: Partial<NetState>) => {
    this.state = { ...this.state, ...next };
    this.deps.pushState(this.state);
  };

  private clearFakes = (): boolean => {
    if (this.fakes.length === 0) return false;
    this.fakes = [];
    this.fakeRev += 1;
    return true;
  };

  // The only way opponent state leaves here, so everything the board is
  // shown agrees; the roster and the wire read their own sources.
  private opponentState = (): OpponentState => {
    const snapshot = this.remote.snapshot();
    // The offset outlives the fakes themselves: both halves only grow, so
    // the board never sees seq go backwards and drop an update.
    const seq = snapshot.seq + this.fakeRev;
    if (this.fakes.length === 0) return { ...snapshot, seq };
    return {
      ...snapshot,
      seq,
      // Fakes sit in guest seats, so the local player holds the host's.
      selfSeat: snapshot.selfSeat ?? HOST_SEAT,
      peers: [...snapshot.peers, ...this.fakes],
    };
  };

  private pushOpponent = () => {
    this.deps.pushOpponent(this.opponentState());
  };
}
