import { randomBytes } from 'node:crypto';

import { generateLobbyCode } from '../src/shared/net/lobbyCode';
import {
  HOST_RELAY_SEAT,
  RelayClose,
  type RelayCloseCode,
  type RelayServerFrame,
} from '../src/shared/net/relay';
import type { RelayConfig } from './config';

// Whatever can receive frames; the WebSocket layer supplies the real one
// and tests supply a fake.
export interface Connection {
  send(frame: RelayServerFrame): void;
  close(code: RelayCloseCode, reason: string): void;
}

export interface Lobby {
  code: string;
  appId: string;
  hostToken: string;
  slots: number;
  seats: Map<number, Connection>;
  createdAt: number;
  expiresAt: number;
  // When the last connection left, so an abandoned lobby is swept.
  emptySince: number | null;
  bytes: number;
}

export type SeatDenial = 'lobbyFull' | 'noSuchLobby';

export class LobbyRegistry {
  private readonly lobbies = new Map<string, Lobby>();

  constructor(
    private readonly config: RelayConfig,
    private readonly now: () => number = Date.now,
    private readonly newCode: () => string = generateLobbyCode
  ) {}

  get size(): number {
    return this.lobbies.size;
  }

  get connections(): number {
    return [...this.lobbies.values()].reduce((n, l) => n + l.seats.size, 0);
  }

  get full(): boolean {
    return this.lobbies.size >= this.config.maxLobbies;
  }

  create(appId: string, slots: number): Lobby {
    const at = this.now();
    let code = this.newCode();
    // Codes are ~30 bits, so a clash is a curiosity, not a plan.
    for (let tries = 0; this.lobbies.has(code) && tries < 8; tries += 1) {
      code = this.newCode();
    }
    const lobby: Lobby = {
      code,
      appId,
      hostToken: randomBytes(24).toString('base64url'),
      slots,
      seats: new Map(),
      createdAt: at,
      expiresAt: at + this.config.lobbyTtlMs,
      emptySince: at,
      bytes: 0,
    };
    this.lobbies.set(code, lobby);
    return lobby;
  }

  get(code: string): Lobby | undefined {
    const lobby = this.lobbies.get(code);
    if (!lobby) return undefined;
    if (lobby.expiresAt <= this.now()) {
      this.destroy(lobby, RelayClose.noSuchLobby, 'lobby expired');
      return undefined;
    }
    return lobby;
  }

  // The host claims seat 1 with its token; everyone else takes the
  // lowest free seat.
  claimSeat(lobby: Lobby, isHost: boolean): number | SeatDenial {
    if (isHost) {
      return lobby.seats.has(HOST_RELAY_SEAT) ? 'lobbyFull' : HOST_RELAY_SEAT;
    }
    for (let seat = HOST_RELAY_SEAT + 1; seat <= lobby.slots; seat += 1) {
      if (!lobby.seats.has(seat)) return seat;
    }
    return 'lobbyFull';
  }

  join(lobby: Lobby, seat: number, connection: Connection): void {
    lobby.seats.set(seat, connection);
    lobby.emptySince = null;
    connection.send({
      ev: 'seated',
      seat,
      code: lobby.code,
      slots: lobby.slots,
      peers: [...lobby.seats.keys()].filter((other) => other !== seat).sort(),
    });
    this.broadcast(lobby, seat, { ev: 'peer', seat, state: 'open' });
  }

  // A seat went away. The host leaving ends the lobby, because the pod
  // is a star with the host at its centre.
  part(lobby: Lobby, seat: number): void {
    if (lobby.seats.delete(seat) === false) return;
    if (seat === HOST_RELAY_SEAT) {
      this.destroy(lobby, RelayClose.lobbyClosed, 'the host left');
      return;
    }
    this.broadcast(lobby, seat, { ev: 'peer', seat, state: 'closed' });
    if (lobby.seats.size === 0) lobby.emptySince = this.now();
  }

  relay(
    lobby: Lobby,
    from: number,
    to: number[] | 'all',
    data: string
  ): boolean {
    const bytes = Buffer.byteLength(data, 'utf8');
    lobby.bytes += bytes;
    if (lobby.bytes > this.config.lobbyByteBudget) {
      this.destroy(lobby, RelayClose.rateLimited, 'lobby traffic budget spent');
      return false;
    }
    const targets =
      to === 'all'
        ? [...lobby.seats.keys()].filter((seat) => seat !== from)
        : to.filter((seat) => seat !== from);
    targets.forEach((seat) =>
      lobby.seats.get(seat)?.send({ ev: 'data', from, data })
    );
    return true;
  }

  remove(lobby: Lobby, seat: number): void {
    const connection = lobby.seats.get(seat);
    if (!connection) return;
    connection.close(RelayClose.removed, 'removed by the host');
  }

  destroy(lobby: Lobby, code: RelayCloseCode, reason: string): void {
    this.lobbies.delete(lobby.code);
    const seats = [...lobby.seats.values()];
    lobby.seats.clear();
    seats.forEach((connection) => connection.close(code, reason));
  }

  // Expired lobbies, and ones nobody came back to.
  sweep(): void {
    const at = this.now();
    [...this.lobbies.values()].forEach((lobby) => {
      if (lobby.expiresAt <= at) {
        this.destroy(lobby, RelayClose.noSuchLobby, 'lobby expired');
      } else if (
        lobby.emptySince !== null &&
        at - lobby.emptySince >= this.config.emptyGraceMs
      ) {
        this.destroy(lobby, RelayClose.noSuchLobby, 'lobby abandoned');
      }
    });
  }

  shutdown(): void {
    [...this.lobbies.values()].forEach((lobby) =>
      this.destroy(lobby, RelayClose.serverGoingAway, 'server shutting down')
    );
  }

  private broadcast(lobby: Lobby, except: number, frame: RelayServerFrame) {
    lobby.seats.forEach((connection, seat) => {
      if (seat !== except) connection.send(frame);
    });
  }
}
