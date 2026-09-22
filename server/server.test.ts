import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_RELAY_DATA_BYTES,
  parseCreateLobbyResponse,
  RelayClose,
} from '../src/shared/net/relay';
import {
  APP_ID,
  APP_KEY,
  createLobby,
  dial,
  seatedAt,
  startRelay,
  type TestClient,
} from './testClient';

let stop: (() => Promise<void>) | null = null;

afterEach(async () => {
  await stop?.();
  stop = null;
});

const relay = async (overrides = {}) => {
  const started = await startRelay(overrides);
  stop = started.close;
  return started;
};

// A host and `guests` guests, all seated and quiet.
const pod = async (baseUrl: string, guests: number, body = {}) => {
  const created = await createLobby(baseUrl, { body });
  const lobby = parseCreateLobbyResponse(created.text);
  const host = dial(baseUrl, { code: lobby.code, token: lobby.hostToken });
  expect(await seatedAt(host)).toBe(1);
  const joined: TestClient[] = [];
  for (let i = 0; i < guests; i += 1) {
    const guest = dial(baseUrl, { code: lobby.code });
    expect(await seatedAt(guest)).toBe(2 + i);
    joined.push(guest);
    // The host hears about each arrival.
    expect(await host.next()).toEqual({
      ev: 'peer',
      seat: 2 + i,
      state: 'open',
    });
    // So does everyone already seated.
    for (const earlier of joined.slice(0, -1)) {
      expect(await earlier.next()).toEqual({
        ev: 'peer',
        seat: 2 + i,
        state: 'open',
      });
    }
  }
  return { lobby, host, guests: joined };
};

describe('http', () => {
  it('answers healthz without a key', async () => {
    const { baseUrl } = await relay();
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, v: 1 });
  });

  it('404s anything else', async () => {
    const { baseUrl } = await relay();
    expect((await fetch(`${baseUrl}/`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/v1/lobbies`)).status).toBe(404);
  });

  it('creates a lobby for a known app', async () => {
    const { baseUrl } = await relay();
    const { status, text } = await createLobby(baseUrl);
    expect(status).toBe(201);
    const lobby = parseCreateLobbyResponse(text);
    expect(lobby.slots).toBe(4);
    expect(lobby.hostToken.length).toBeGreaterThan(20);
    expect(Date.parse(lobby.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('takes the credentials from the query as well as the headers', async () => {
    const { baseUrl } = await relay();
    const { status, text } = await createLobby(baseUrl, { where: 'query' });
    expect(status).toBe(201);
    expect(parseCreateLobbyResponse(text).code).toHaveLength(6);
  });

  it('turns away a wrong key wherever it came from', async () => {
    const { baseUrl } = await relay();
    expect(
      (await createLobby(baseUrl, { where: 'query', appKey: 'wrong' })).status
    ).toBe(401);
    expect((await createLobby(baseUrl, { where: 'none' })).status).toBe(401);
  });

  it('prefers a header over the query, so a proxy cannot be talked past', async () => {
    const { baseUrl } = await relay();
    const url = new URL('/v1/lobbies', baseUrl);
    url.searchParams.set('app', APP_ID);
    url.searchParams.set('key', APP_KEY);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-app-id': APP_ID, 'x-app-key': 'wrong' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('turns away an unknown app or a wrong key', async () => {
    const { baseUrl } = await relay();
    expect((await createLobby(baseUrl, { appId: 'other' })).status).toBe(401);
    expect((await createLobby(baseUrl, { appKey: 'wrong' })).status).toBe(401);
    expect((await createLobby(baseUrl, { appKey: '' })).status).toBe(401);
  });

  it('honours a slot count and rejects a silly one', async () => {
    const { baseUrl } = await relay();
    const ok = await createLobby(baseUrl, { body: { slots: 2 } });
    expect(parseCreateLobbyResponse(ok.text).slots).toBe(2);
    for (const slots of [1, 9, 2.5, 'four']) {
      expect((await createLobby(baseUrl, { body: { slots } })).status).toBe(
        400
      );
    }
  });

  it('rate-limits lobby creation per address', async () => {
    const { baseUrl } = await relay({ lobbiesPerIpPerHour: 2 });
    expect((await createLobby(baseUrl)).status).toBe(201);
    expect((await createLobby(baseUrl)).status).toBe(201);
    expect((await createLobby(baseUrl)).status).toBe(429);
  });

  it('refuses new lobbies when it is already carrying too many', async () => {
    const { baseUrl } = await relay({ maxLobbies: 1 });
    expect((await createLobby(baseUrl)).status).toBe(201);
    expect((await createLobby(baseUrl)).status).toBe(503);
  });
});

describe('seating', () => {
  it('seats the host first and guests after', async () => {
    const { baseUrl } = await relay();
    const { guests } = await pod(baseUrl, 2);
    expect(guests).toHaveLength(2);
  });

  it('tells a newcomer who is already here', async () => {
    const { baseUrl } = await relay();
    const created = await createLobby(baseUrl);
    const lobby = parseCreateLobbyResponse(created.text);
    const host = dial(baseUrl, { code: lobby.code, token: lobby.hostToken });
    await seatedAt(host);
    const first = dial(baseUrl, { code: lobby.code });
    await seatedAt(first);
    await host.next();
    const second = dial(baseUrl, { code: lobby.code });
    expect(await second.next()).toEqual({
      ev: 'seated',
      seat: 3,
      code: lobby.code,
      slots: 4,
      peers: [1, 2],
    });
  });

  it('turns away an unknown code after upgrading, so the user is told', async () => {
    const { baseUrl } = await relay();
    const client = dial(baseUrl, { code: 'ZZZZZZ' });
    expect(await client.next()).toMatchObject({
      ev: 'error',
      code: 'no_such_lobby',
    });
    expect((await client.closed).code).toBe(RelayClose.noSuchLobby);
  });

  it('turns away a full lobby', async () => {
    const { baseUrl } = await relay();
    const { lobby } = await pod(baseUrl, 1, { slots: 2 });
    const late = dial(baseUrl, { code: lobby.code });
    expect(await late.next()).toMatchObject({ code: 'lobby_full' });
    expect((await late.closed).code).toBe(RelayClose.lobbyFull);
  });

  it('turns away a second host', async () => {
    const { baseUrl } = await relay();
    const { lobby } = await pod(baseUrl, 0);
    const twin = dial(baseUrl, { code: lobby.code, token: lobby.hostToken });
    expect(await twin.next()).toMatchObject({ code: 'lobby_full' });
  });

  it('never upgrades for a bad key or a bad version', async () => {
    const { baseUrl } = await relay();
    const { lobby } = await pod(baseUrl, 0);
    const wrongKey = dial(baseUrl, { code: lobby.code, appKey: 'nope' });
    expect((await wrongKey.closed).code).toBe(1006);
    const wrongVersion = dial(baseUrl, { code: lobby.code, version: '99' });
    expect((await wrongVersion.closed).code).toBe(1006);
  });
});

describe('relaying', () => {
  it('moves a guest message to the host', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 1);
    guests[0].send({ op: 'send', to: 'all', data: 'hello host' });
    expect(await host.next()).toEqual({
      ev: 'data',
      from: 2,
      data: 'hello host',
    });
  });

  it('addresses named seats and never echoes the sender', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 2);
    host.send({ op: 'send', to: [3], data: 'for three' });
    expect(await guests[1].next()).toEqual({
      ev: 'data',
      from: 1,
      data: 'for three',
    });
    host.send({ op: 'send', to: 'all', data: 'for everyone' });
    expect(await guests[0].next()).toMatchObject({ data: 'for everyone' });
    expect(await guests[1].next()).toMatchObject({ data: 'for everyone' });
    expect(host.frames).toEqual([]);
  });

  it('ignores a seat that is not there', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 1);
    host.send({ op: 'send', to: [4], data: 'nobody' });
    host.send({ op: 'send', to: [2], data: 'somebody' });
    expect(await guests[0].next()).toMatchObject({ data: 'somebody' });
  });

  it('carries a full-size payload', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 1);
    const data = 'x'.repeat(MAX_RELAY_DATA_BYTES);
    guests[0].send({ op: 'send', to: 'all', data });
    expect(await host.next()).toMatchObject({ data });
  });
});

describe('leaving', () => {
  it('tells the pod when a guest leaves', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 2);
    guests[0].send({ op: 'leave' });
    expect(await host.next()).toEqual({ ev: 'peer', seat: 2, state: 'closed' });
    expect(await guests[1].next()).toEqual({
      ev: 'peer',
      seat: 2,
      state: 'closed',
    });
  });

  it('tells the pod when a guest just vanishes', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 1);
    guests[0].close();
    expect(await host.next()).toEqual({ ev: 'peer', seat: 2, state: 'closed' });
  });

  it('ends the lobby when the host leaves', async () => {
    const { baseUrl } = await relay();
    const { lobby, host, guests } = await pod(baseUrl, 2);
    host.close();
    expect((await guests[0].closed).code).toBe(RelayClose.lobbyClosed);
    expect((await guests[1].closed).code).toBe(RelayClose.lobbyClosed);
    const late = dial(baseUrl, { code: lobby.code });
    expect(await late.next()).toMatchObject({ code: 'no_such_lobby' });
  });

  it('lets the host remove a seat', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 2);
    host.send({ op: 'close', seat: 3 });
    expect((await guests[1].closed).code).toBe(RelayClose.removed);
    expect(await host.next()).toEqual({ ev: 'peer', seat: 3, state: 'closed' });
  });

  it('ignores a guest trying to remove someone', async () => {
    const { baseUrl } = await relay();
    const { host, guests } = await pod(baseUrl, 2);
    guests[0].send({ op: 'close', seat: 3 });
    guests[0].send({ op: 'send', to: [3], data: 'still here' });
    expect(await guests[1].next()).toMatchObject({ data: 'still here' });
    expect(host.frames).toEqual([]);
  });

  it('frees the seat so someone else can take it', async () => {
    const { baseUrl } = await relay();
    const { lobby, host, guests } = await pod(baseUrl, 1);
    guests[0].send({ op: 'leave' });
    await host.next();
    const replacement = dial(baseUrl, { code: lobby.code });
    expect(await seatedAt(replacement)).toBe(2);
  });
});

describe('abuse', () => {
  it('hangs up on an unreadable frame', async () => {
    const { baseUrl } = await relay();
    const { guests } = await pod(baseUrl, 1);
    guests[0].send('{"op":"nonsense"}');
    expect(await guests[0].next()).toMatchObject({ code: 'bad_frame' });
    expect((await guests[0].closed).code).toBe(RelayClose.badFrame);
  });

  it('hangs up on a binary frame', async () => {
    const { baseUrl } = await relay();
    const { guests } = await pod(baseUrl, 1);
    guests[0].sendRaw(new Uint8Array([1, 2, 3]));
    expect(await guests[0].next()).toMatchObject({ code: 'bad_frame' });
  });

  it('hangs up on a frame over the payload limit', async () => {
    const { baseUrl } = await relay();
    const { guests } = await pod(baseUrl, 1);
    guests[0].send({
      op: 'send',
      to: 'all',
      data: 'x'.repeat(MAX_RELAY_DATA_BYTES + 8192),
    });
    expect((await guests[0].closed).code).toBe(1009);
  });

  it('hangs up on a firehose', async () => {
    const { baseUrl } = await relay({ bytesPerSecond: 1, burstBytes: 64 });
    const { guests } = await pod(baseUrl, 1);
    guests[0].send({ op: 'send', to: 'all', data: 'x'.repeat(500) });
    expect((await guests[0].closed).code).toBe(RelayClose.rateLimited);
  });

  it('ends a lobby that has spent its traffic budget', async () => {
    const { baseUrl } = await relay({ lobbyByteBudget: 100 });
    const { host, guests } = await pod(baseUrl, 1);
    guests[0].send({ op: 'send', to: 'all', data: 'x'.repeat(200) });
    expect((await host.closed).code).toBe(RelayClose.rateLimited);
  });

  it('caps how many sockets one address may hold', async () => {
    const { baseUrl } = await relay({ maxSocketsPerIp: 2 });
    const { lobby } = await pod(baseUrl, 1);
    const third = dial(baseUrl, { code: lobby.code });
    expect((await third.closed).code).toBe(1006);
  });
});
