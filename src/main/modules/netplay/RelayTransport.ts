import { normalizeLobbyCode } from '@shared/net/lobbyCode';
import type { NetCommand, NetReport } from '@shared/net/lobby';
import { HOST_SEAT, MAX_SEATS } from '@shared/net/protocol';
import {
  createLobbyUrl,
  encodeRelayFrame,
  HOST_RELAY_SEAT,
  parseCreateLobbyResponse,
  parseRelayServerFrame,
  type RelayClientFrame,
  RelayClose,
} from '@shared/net/relay';
import { relayWebSocketUrl } from '@shared/net/relay';

import type { Transport } from './Netplay';

// Just enough of WebSocket to drive, so tests can supply a fake.
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void
  ): void;
  addEventListener(type: 'close', listener: (event: CloseEvent) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
}

export interface RelaySettings {
  baseUrl: string;
  appId: string;
  appKey: string;
}

export interface RelayTransportDeps {
  settings(): RelaySettings;
  report(report: NetReport): void;
  fetch?: typeof globalThis.fetch;
  createSocket?(url: string): SocketLike;
}

const OPEN = 1;

// Why a socket went away, in words the player can act on.
const CLOSE_REASONS: Record<number, string> = {
  [RelayClose.unauthorized]:
    'This copy of the app was turned away by the relay server.',
  [RelayClose.noSuchLobby]:
    'That lobby code is not open. Check it, or ask for a new one.',
  [RelayClose.lobbyFull]: 'That game is already full.',
  [RelayClose.badFrame]: 'The relay server rejected a message.',
  [RelayClose.rateLimited]:
    'The relay server cut the connection: too much traffic.',
  [RelayClose.serverGoingAway]: 'The relay server is restarting.',
};

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

// The relay side of the same seam the peer-to-peer net window fills. One
// WebSocket carries the whole pod: the host holds seat 1 and relays, so
// a guest only ever hears from the host's seat.
export default class RelayTransport implements Transport {
  private socket: SocketLike | null = null;

  private isHost = false;

  // Bumped on every retire, so a slow connect from an old session is
  // ignored when it finally lands.
  private session = 0;

  constructor(private readonly deps: RelayTransportDeps) {}

  open = async (): Promise<boolean> => true;

  send = (command: NetCommand): void => {
    switch (command.op) {
      case 'hostLobby':
        void this.startHosting(command.slots);
        return;
      case 'joinLobby':
        void this.startJoining(command.code);
        return;
      case 'send':
        this.frame({
          op: 'send',
          to: this.targets(command.seats),
          data: command.data,
        });
        return;
      case 'close':
        if (this.isHost) this.frame({ op: 'close', seat: command.seat });
        return;
      case 'leave':
        this.frame({ op: 'leave' });
        return;
      default:
        // The peer-to-peer commands mean nothing here.
        return;
    }
  };

  retire = (): void => {
    this.session += 1;
    const socket = this.socket;
    this.socket = null;
    this.isHost = false;
    socket?.close(1000, 'left');
  };

  private fetch = (...args: Parameters<typeof globalThis.fetch>) =>
    (this.deps.fetch ?? globalThis.fetch)(...args);

  private createSocket = (url: string): SocketLike =>
    this.deps.createSocket
      ? this.deps.createSocket(url)
      : (new WebSocket(url) as SocketLike);

  private startHosting = async (slots: number) => {
    const session = this.session;
    const settings = this.deps.settings();
    if (!this.checkSettings(settings)) return;
    try {
      const res = await this.fetch(createLobbyUrl(settings), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-app-id': settings.appId,
          'x-app-key': settings.appKey,
        },
        body: JSON.stringify({ slots }),
      });
      const text = await res.text();
      if (session !== this.session) return;
      if (!res.ok) {
        this.fail(lobbyHttpError(res.status));
        return;
      }
      const lobby = parseCreateLobbyResponse(text);
      this.connect(settings, lobby.code, lobby.hostToken, session);
    } catch (err) {
      if (session === this.session) {
        this.fail(`Could not reach the relay server. (${message(err)})`);
      }
    }
  };

  private startJoining = async (input: string) => {
    const settings = this.deps.settings();
    if (!this.checkSettings(settings)) return;
    const code = normalizeLobbyCode(input);
    if (!code) {
      this.fail('That is not a lobby code. They are six characters long.');
      return;
    }
    this.connect(settings, code, undefined, this.session);
  };

  private checkSettings = (settings: RelaySettings): boolean => {
    if (settings.baseUrl.trim() === '') {
      this.fail(
        'No relay server is set. Add one in Settings to use lobby codes.'
      );
      return false;
    }
    if (settings.appKey.trim() === '') {
      this.fail('No relay key is set. Add one in Settings to use lobby codes.');
      return false;
    }
    return true;
  };

  private connect = (
    settings: RelaySettings,
    code: string,
    token: string | undefined,
    session: number
  ) => {
    let url: string;
    try {
      url = relayWebSocketUrl({ ...settings, code, token });
    } catch (err) {
      this.fail(`That relay address is not a URL. (${message(err)})`);
      return;
    }

    const socket = this.createSocket(url);
    this.socket = socket;
    this.isHost = token !== undefined;
    const live = () => this.socket === socket && session === this.session;
    // A close code explains the failure; a socket that never opened does
    // not, so say something useful either way.
    let seated = false;
    let closeMessage: string | null = null;

    socket.addEventListener('message', (event: MessageEvent) => {
      if (!live() || typeof event.data !== 'string') return;
      try {
        const frame = parseRelayServerFrame(event.data);
        if (frame.ev === 'error') closeMessage = frame.message;
        else seated = seated || frame.ev === 'seated';
        this.receive(frame, code);
      } catch {
        // The relay is ours; an unreadable frame is not worth a dialog.
      }
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (!live()) return;
      this.socket = null;
      const reason = closeMessage ?? CLOSE_REASONS[event.code] ?? null;
      if (seated) {
        this.report({ type: 'closed', seat: HOST_SEAT });
        if (reason) this.fail(reason);
      } else {
        this.fail(reason ?? 'Could not reach the relay server.');
      }
    });

    socket.addEventListener('error', () => {
      // A failed handshake only ever surfaces as a close, so wait for it.
    });
  };

  // Frames arrive addressed by relay seat. The host uses them as they
  // are; a guest folds everything onto the host's seat, which is the
  // only link its side of the app knows about.
  private receive = (
    frame: ReturnType<typeof parseRelayServerFrame>,
    code: string
  ) => {
    if (frame.ev === 'seated') {
      this.report({ type: 'lobby', seat: HOST_SEAT, code: frame.code || code });
      if (!this.isHost && frame.peers.includes(HOST_RELAY_SEAT)) {
        this.report({ type: 'open', seat: HOST_SEAT });
      }
      return;
    }
    if (frame.ev === 'error') {
      this.fail(frame.message);
      return;
    }
    if (frame.ev === 'peer') {
      const seat = this.localSeat(frame.seat);
      if (seat === null) return;
      this.report(
        frame.state === 'open'
          ? { type: 'open', seat }
          : { type: 'closed', seat }
      );
      return;
    }
    const from = this.localSeat(frame.from);
    if (from !== null)
      this.report({ type: 'message', seat: from, data: frame.data });
  };

  // A relay seat as this side of the app names it, or null to ignore.
  private localSeat = (seat: number): number | null => {
    if (!this.isHost) return seat === HOST_RELAY_SEAT ? HOST_SEAT : null;
    return seat > HOST_RELAY_SEAT && seat <= MAX_SEATS ? seat : null;
  };

  // Guests address the host's seat; the relay knows it as seat 1 too.
  private targets = (seats: number[]): number[] =>
    this.isHost ? seats : seats.map(() => HOST_RELAY_SEAT);

  private frame = (frame: RelayClientFrame) => {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return;
    try {
      socket.send(encodeRelayFrame(frame));
    } catch (err) {
      this.fail(`Could not send. (${message(err)})`);
    }
  };

  private fail = (text: string) => {
    this.report({ type: 'lobbyFailed', seat: HOST_SEAT, message: text });
  };

  private report = (report: NetReport) => {
    this.deps.report(report);
  };
}

const lobbyHttpError = (status: number): string => {
  if (status === 401) {
    return 'This copy of the app was turned away by the relay server.';
  }
  if (status === 429) return 'Too many lobbies from here. Try again later.';
  if (status === 503) return 'The relay server is busy. Try again in a moment.';
  return `The relay server refused to open a lobby (${status}).`;
};
