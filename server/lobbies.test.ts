import { beforeEach, describe, expect, it } from 'vitest';

import { RelayClose, type RelayServerFrame } from '../src/shared/net/relay';
import { loadConfig } from './config';
import { type Connection, LobbyRegistry } from './lobbies';

const config = (overrides = {}) => ({
  ...loadConfig({ RELAY_APP_KEYS: 'a:one' }),
  ...overrides,
});

const fakeConnection = () => {
  const frames: RelayServerFrame[] = [];
  const closes: { code: number; reason: string }[] = [];
  const connection: Connection = {
    send: (frame) => frames.push(frame),
    close: (code, reason) => closes.push({ code, reason }),
  };
  return { connection, frames, closes };
};

let now = 1_000;

beforeEach(() => {
  now = 1_000;
});

const registry = (overrides = {}, newCode?: () => string) =>
  new LobbyRegistry(config(overrides), () => now, newCode);

describe('LobbyRegistry', () => {
  it('creates a lobby with a token and a code', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 4);
    expect(lobby.code).toHaveLength(6);
    expect(lobby.hostToken).not.toBe('');
    expect(lobbies.get(lobby.code)).toBe(lobby);
    expect(lobbies.size).toBe(1);
  });

  it('hands the host seat 1 and guests the next free seat', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 3);
    expect(lobbies.claimSeat(lobby, true)).toBe(1);
    lobbies.join(lobby, 1, fakeConnection().connection);
    expect(lobbies.claimSeat(lobby, true)).toBe('lobbyFull');
    expect(lobbies.claimSeat(lobby, false)).toBe(2);
    lobbies.join(lobby, 2, fakeConnection().connection);
    expect(lobbies.claimSeat(lobby, false)).toBe(3);
    lobbies.join(lobby, 3, fakeConnection().connection);
    expect(lobbies.claimSeat(lobby, false)).toBe('lobbyFull');
  });

  it('reuses a seat that was given up', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 1, fakeConnection().connection);
    lobbies.join(lobby, 2, fakeConnection().connection);
    lobbies.join(lobby, 3, fakeConnection().connection);
    lobbies.part(lobby, 2);
    expect(lobbies.claimSeat(lobby, false)).toBe(2);
  });

  it('counts its connections', () => {
    const lobbies = registry();
    const one = lobbies.create('a', 4);
    const two = lobbies.create('a', 4);
    lobbies.join(one, 1, fakeConnection().connection);
    lobbies.join(two, 1, fakeConnection().connection);
    lobbies.join(two, 2, fakeConnection().connection);
    expect(lobbies.connections).toBe(3);
  });

  it('stops relaying once a lobby has spent its budget', () => {
    const lobbies = registry({ lobbyByteBudget: 10 });
    const lobby = lobbies.create('a', 4);
    const host = fakeConnection();
    lobbies.join(lobby, 1, host.connection);
    lobbies.join(lobby, 2, fakeConnection().connection);
    host.frames.length = 0;
    expect(lobbies.relay(lobby, 2, 'all', 'x'.repeat(20))).toBe(false);
    expect(host.closes[0].code).toBe(RelayClose.rateLimited);
    expect(lobbies.size).toBe(0);
  });

  it('counts bytes towards the budget even when nobody is listening', () => {
    const lobbies = registry({ lobbyByteBudget: 30 });
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 1, fakeConnection().connection);
    expect(lobbies.relay(lobby, 1, 'all', 'x'.repeat(20))).toBe(true);
    expect(lobbies.relay(lobby, 1, 'all', 'x'.repeat(20))).toBe(false);
  });

  it('measures bytes, not characters', () => {
    const lobbies = registry({ lobbyByteBudget: 5 });
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 1, fakeConnection().connection);
    // Three characters, nine bytes.
    expect(lobbies.relay(lobby, 1, 'all', '日本語')).toBe(false);
  });

  it('forgets an expired lobby the moment it is asked for', () => {
    const lobbies = registry({ lobbyTtlMs: 100 });
    const lobby = lobbies.create('a', 4);
    const host = fakeConnection();
    lobbies.join(lobby, 1, host.connection);
    now += 101;
    expect(lobbies.get(lobby.code)).toBeUndefined();
    expect(host.closes[0].code).toBe(RelayClose.noSuchLobby);
  });

  it('sweeps expired lobbies', () => {
    const lobbies = registry({ lobbyTtlMs: 100 });
    lobbies.create('a', 4);
    lobbies.sweep();
    expect(lobbies.size).toBe(1);
    now += 101;
    lobbies.sweep();
    expect(lobbies.size).toBe(0);
  });

  it('sweeps a lobby nobody came back to', () => {
    const lobbies = registry({ emptyGraceMs: 500 });
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 1, fakeConnection().connection);
    now += 10_000;
    // Occupied, so the grace period does not apply.
    lobbies.sweep();
    expect(lobbies.size).toBe(1);
    lobbies.part(lobby, 1);
    // The host leaving ends it outright.
    expect(lobbies.size).toBe(0);
  });

  it('keeps an empty guest-only lobby until the grace runs out', () => {
    const lobbies = registry({ emptyGraceMs: 500 });
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 2, fakeConnection().connection);
    lobbies.part(lobby, 2);
    now += 499;
    lobbies.sweep();
    expect(lobbies.size).toBe(1);
    now += 2;
    lobbies.sweep();
    expect(lobbies.size).toBe(0);
  });

  it('ends the lobby when the host parts', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 4);
    lobbies.join(lobby, 1, fakeConnection().connection);
    const guest = fakeConnection();
    lobbies.join(lobby, 2, guest.connection);
    lobbies.part(lobby, 1);
    expect(guest.closes[0]).toEqual({
      code: RelayClose.lobbyClosed,
      reason: 'the host left',
    });
    expect(lobbies.size).toBe(0);
  });

  it('ignores a seat parting twice', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 4);
    const host = fakeConnection();
    lobbies.join(lobby, 1, host.connection);
    const guest = fakeConnection();
    lobbies.join(lobby, 2, guest.connection);
    host.frames.length = 0;
    lobbies.part(lobby, 2);
    lobbies.part(lobby, 2);
    expect(host.frames).toEqual([{ ev: 'peer', seat: 2, state: 'closed' }]);
  });

  it('closes everything on shutdown', () => {
    const lobbies = registry();
    const lobby = lobbies.create('a', 4);
    const host = fakeConnection();
    lobbies.join(lobby, 1, host.connection);
    lobbies.shutdown();
    expect(host.closes[0].code).toBe(RelayClose.serverGoingAway);
    expect(lobbies.size).toBe(0);
  });

  it('knows when it is carrying too many lobbies', () => {
    const lobbies = registry({ maxLobbies: 2 });
    expect(lobbies.full).toBe(false);
    lobbies.create('a', 4);
    lobbies.create('a', 4);
    expect(lobbies.full).toBe(true);
  });

  it('retries a clashing code', () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    let next = 0;
    const lobbies = registry({}, () => {
      const code = codes[next] ?? 'ZZZZZZ';
      next += 1;
      return code;
    });
    expect(lobbies.create('a', 4).code).toBe('AAAAAA');
    expect(lobbies.create('a', 4).code).toBe('BBBBBB');
    expect(lobbies.size).toBe(2);
  });
});
