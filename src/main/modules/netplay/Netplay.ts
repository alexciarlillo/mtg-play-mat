import type { PublicView } from '@shared/game';
import {
  CodeError,
  extractCode,
  parseJoinLink,
  type SessionDescription,
  unpackDescription,
} from '@shared/net/codec';
import {
  idleNetState,
  type NetCommand,
  type NetConfig,
  type NetReport,
  type NetState,
  parseNetReport,
} from '@shared/net/lobby';
import {
  encodeNetMessage,
  MAX_MESSAGE_BYTES,
  type NetMessage,
  type NetPayload,
  parseNetMessage,
  PROTOCOL_VERSION,
} from '@shared/net/protocol';
import { type OpponentState, RemoteViews } from '@shared/net/remoteViews';

import type { RequestHandlers } from '../../ipc';

// Where the peer connection actually lives (a hidden renderer window).
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
  pushState(state: NetState): void;
  pushOpponent(state: OpponentState): void;
  // How long the host waits for the channel after pasting the reply.
  connectTimeoutMs?: number;
}

type NetplayHandlers = Pick<
  RequestHandlers,
  | 'getNetState'
  | 'netHost'
  | 'netAcceptReply'
  | 'netJoin'
  | 'netLeave'
  | 'netResend'
  | 'netReport'
  | 'getOpponentView'
>;

const NO_ROUTE =
  'Could not find a route between you. One of you is probably behind a ' +
  'restrictive network: try again on the same Wi-Fi, or over a VPN.';

const describeCodeError = (err: unknown, fallback: string) =>
  err instanceof CodeError ? err.message : fallback;

// The lobby and the wire protocol. Main is the hub: local view changes go
// out through the transport, and peer messages come back here, are
// checked, and only then reach the board.
export default class Netplay {
  private state: NetState = idleNetState;

  private readonly remote = new RemoteViews();

  private channelOpen = false;

  private seq = 0;

  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  // Bumped on every new session, so late async work from an old one is
  // ignored.
  private session = 0;

  constructor(private readonly deps: NetplayDeps) {}

  readonly handlers: NetplayHandlers = {
    getNetState: () => this.state,
    netHost: () => this.host(),
    netAcceptReply: (code: unknown) => this.acceptReply(code),
    netJoin: (code: unknown) => this.join(code),
    netLeave: () => this.leave(),
    netResend: () => this.resend(),
    netReport: (input: unknown) => {
      const report = parseNetReport(input);
      if (report) this.handleReport(report);
    },
    getOpponentView: () => this.remote.snapshot(),
  };

  get netState(): NetState {
    return this.state;
  }

  // An invite from a mtgplaymat:// link waits in the lobby until the user
  // joins with it; it never connects on its own.
  receiveLink = (link: string): boolean => {
    const code = parseJoinLink(link);
    if (!code) return false;
    this.update({ pendingInvite: code });
    return true;
  };

  localViewChanged = (view: PublicView | null) => {
    if (this.channelOpen) this.send({ kind: 'public', view });
  };

  host = async () => {
    const session = this.reset({
      role: 'host',
      phase: 'creatingInvite',
      status: 'Gathering routes…',
    });
    if (!(await this.deps.transport.open()) || session !== this.session) {
      return;
    }
    this.deps.transport.send({ op: 'host', config: this.deps.config });
  };

  acceptReply = async (input: unknown) => {
    const { role, phase } = this.state;
    if (role !== 'host' || (phase !== 'awaitingReply' && phase !== 'ended')) {
      return;
    }
    const session = this.session;
    const code = typeof input === 'string' ? extractCode(input) : '';
    const desc = await this.check(code, 'answer');
    if (!desc || session !== this.session) return;

    this.update({ phase: 'connecting', status: 'Connecting…', error: null });
    this.deps.transport.send({ op: 'acceptReply', code });
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (session === this.session && !this.channelOpen) {
        this.update({ phase: 'awaitingReply', status: '', error: NO_ROUTE });
      }
    }, this.deps.connectTimeoutMs ?? 30_000);
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
    if (this.channelOpen) this.send({ kind: 'bye' });
    this.reset({});
  };

  resend = () => {
    if (!this.channelOpen) return;
    this.send({ kind: 'hello', ...this.helloInfo() });
    this.send({ kind: 'public', view: this.deps.localView() });
  };

  handleReport = (report: NetReport) => {
    switch (report.type) {
      case 'invite':
        this.update({
          invite: report.code,
          phase: 'awaitingReply',
          status: 'Send the invite to your opponent, then paste their reply.',
        });
        return;
      case 'reply':
        this.update({
          reply: report.code,
          phase: 'awaitingHost',
          status: 'Send this reply back to the host, then wait to connect.',
        });
        return;
      case 'open':
        this.channelOpen = true;
        this.seq = 0;
        this.clearConnectTimer();
        this.update({
          phase: 'connected',
          status: 'Connected. Waiting for your opponent to say hello…',
          error: null,
        });
        this.resend();
        return;
      case 'message':
        this.receive(report.data);
        return;
      case 'connection':
        if (report.state === 'failed') {
          this.end('The connection failed.', NO_ROUTE);
        } else if (report.state === 'disconnected' && this.channelOpen) {
          this.update({ status: 'Connection interrupted, reconnecting…' });
        } else if (report.state === 'connected' && this.channelOpen) {
          this.update({ status: this.connectedStatus() });
        }
        return;
      case 'closed':
        this.end('The connection closed.');
        return;
      case 'error':
        this.failStep(report.message);
        return;
      default:
        return;
    }
  };

  private receive = (raw: string) => {
    let message: NetMessage;
    try {
      message = parseNetMessage(raw);
    } catch (err) {
      console.warn('[netplay] dropped message', String(err));
      return;
    }

    const leaving = message.kind === 'bye';
    const name = this.remote.connectedPeer?.name;
    if (!this.remote.receive(message)) return;
    this.pushOpponent();

    if (message.kind === 'hello') {
      this.update({
        peer: this.remote.connectedPeer,
        status: this.connectedStatus(),
      });
    } else if (leaving) {
      this.end(`${name ?? 'Your opponent'} left the game.`);
    }
  };

  private send = (payload: NetPayload) => {
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
    this.deps.transport.send({ op: 'send', data });
  };

  private helloInfo = () => {
    const { playerId, displayName } = this.deps.profile();
    return { playerId, name: displayName, appVersion: this.deps.appVersion };
  };

  private connectedStatus = () => {
    const peer = this.remote.connectedPeer;
    return peer ? `Connected to ${peer.name}.` : 'Connected.';
  };

  private check = async (
    code: string,
    expected: SessionDescription['type']
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
      this.update({ error: describeCodeError(err, 'That code is not valid.') });
      return null;
    }
  };

  // A step failed before connecting: go back to where the user can retry.
  private failStep = (message: string) => {
    const { phase } = this.state;
    if (phase === 'connecting') {
      this.clearConnectTimer();
      this.update({ phase: 'awaitingReply', status: '', error: message });
    } else if (phase === 'creatingInvite' || phase === 'creatingReply') {
      this.update({ phase: 'ended', status: '', error: message });
    } else {
      this.update({ error: message });
    }
  };

  private end = (status: string, error: string | null = null) => {
    // The first reason wins: a goodbye is followed by the channel closing.
    if (this.state.phase === 'idle' || this.state.phase === 'ended') return;
    this.channelOpen = false;
    this.clearConnectTimer();
    if (this.remote.clear()) this.pushOpponent();
    this.update({ phase: 'ended', status, error, peer: null });
  };

  // Every new session (and leaving) starts from a fresh transport.
  private reset = (next: Partial<NetState>): number => {
    this.deps.transport.send({ op: 'leave' });
    this.deps.transport.retire();
    this.session += 1;
    this.channelOpen = false;
    this.seq = 0;
    this.clearConnectTimer();
    if (this.remote.clear()) this.pushOpponent();
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

  private update = (next: Partial<NetState>) => {
    this.state = { ...this.state, ...next };
    this.deps.pushState(this.state);
  };

  private pushOpponent = () => {
    this.deps.pushOpponent(this.remote.snapshot());
  };
}
