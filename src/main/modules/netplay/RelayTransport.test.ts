// @vitest-environment node
import type { NetReport } from '@shared/net/lobby';
import { RelayClose, type RelayServerFrame } from '@shared/net/relay';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RelayTransport, { type RelaySettings } from './RelayTransport';

class FakeSocket {
  readyState = 1;

  readonly sent: string[] = [];

  closed: { code?: number; reason?: string } | null = null;

  private readonly listeners = new Map<string, ((event: never) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: never) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }

  // Drives the transport the way a real socket would.
  deliver(frame: RelayServerFrame | string) {
    const data = typeof frame === 'string' ? frame : JSON.stringify(frame);
    this.emit('message', { data });
  }

  hangUp(code = 1006, reason = '') {
    this.emit('close', { code, reason });
  }

  frames() {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  private emit(type: string, event: unknown) {
    (this.listeners.get(type) ?? []).forEach((listener) =>
      (listener as (e: unknown) => void)(event)
    );
  }
}

const LOBBY = {
  v: 1,
  code: 'ABC123',
  hostToken: 'host-token',
  slots: 4,
  expiresAt: '2026-12-01T00:00:00.000Z',
};

const settings: RelaySettings = {
  baseUrl: 'https://relay.example.com',
  appId: 'mtg-play-mat',
  appKey: 'app-key',
};

let sockets: FakeSocket[] = [];

const setup = (
  overrides: Partial<RelaySettings> = {},
  response: { status: number; body: unknown } = { status: 201, body: LOBBY }
) => {
  const reports: NetReport[] = [];
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: () => Promise.resolve(JSON.stringify(response.body)),
    } as Response)
  );
  const transport = new RelayTransport({
    settings: () => ({ ...settings, ...overrides }),
    report: (report) => reports.push(report),
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { transport, reports, fetchMock, socket: () => sockets.at(-1) };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const hosting = async () => {
  const t = setup();
  await t.transport.open();
  t.transport.send({ op: 'hostLobby', slots: 4 });
  await flush();
  return t;
};

const joining = async (code = 'ABC123') => {
  const t = setup();
  await t.transport.open();
  t.transport.send({ op: 'joinLobby', code });
  await flush();
  return t;
};

beforeEach(() => {
  sockets = [];
});

describe('hosting a lobby', () => {
  it('creates the lobby, then dials with the host token', async () => {
    const t = await hosting();
    const [url, init] = t.fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const posted = new URL(url);
    expect(posted.origin + posted.pathname).toBe(
      'https://relay.example.com/v1/lobbies'
    );
    // The same credentials go in the headers and the query, so one
    // reverse-proxy rule can gate this and the WebSocket alike.
    expect(Object.fromEntries(posted.searchParams)).toEqual({
      v: '1',
      app: 'mtg-play-mat',
      key: 'app-key',
    });
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-app-id': 'mtg-play-mat',
      'x-app-key': 'app-key',
    });
    expect(init.body).toBe('{"slots":4}');

    const dialled = new URL(t.socket()!.url);
    expect(dialled.protocol).toBe('wss:');
    expect(dialled.pathname).toBe('/v1/ws');
    expect(Object.fromEntries(dialled.searchParams)).toEqual({
      v: '1',
      app: 'mtg-play-mat',
      key: 'app-key',
      code: 'ABC123',
      token: 'host-token',
    });
  });

  it('reports the code once the relay seats it', async () => {
    const t = await hosting();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 1,
      code: 'ABC123',
      slots: 4,
      peers: [],
    });
    expect(t.reports).toEqual([{ type: 'lobby', seat: 1, code: 'ABC123' }]);
  });

  it('turns a guest arriving into an open seat', async () => {
    const t = await hosting();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 1,
      code: 'ABC123',
      slots: 4,
      peers: [],
    });
    t.socket()!.deliver({ ev: 'peer', seat: 3, state: 'open' });
    t.socket()!.deliver({ ev: 'data', from: 3, data: 'hello' });
    t.socket()!.deliver({ ev: 'peer', seat: 3, state: 'closed' });
    expect(t.reports.slice(1)).toEqual([
      { type: 'open', seat: 3 },
      { type: 'message', seat: 3, data: 'hello' },
      { type: 'closed', seat: 3 },
    ]);
  });

  it('ignores a relay seat the app has no link for', async () => {
    const t = await hosting();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 1,
      code: 'ABC123',
      slots: 4,
      peers: [],
    });
    // Its own seat, and one past the four this app plays with.
    t.socket()!.deliver({ ev: 'data', from: 1, data: 'echo' });
    t.socket()!.deliver({ ev: 'peer', seat: 5, state: 'open' });
    expect(t.reports).toHaveLength(1);
  });

  it('addresses the seats it was given', async () => {
    const t = await hosting();
    t.transport.send({ op: 'send', seats: [2, 3], data: 'x' });
    t.transport.send({ op: 'close', seat: 3 });
    expect(t.socket()!.frames()).toEqual([
      { op: 'send', to: [2, 3], data: 'x' },
      { op: 'close', seat: 3 },
    ]);
  });

  it('says why the relay would not open a lobby', async () => {
    for (const [status, text] of [
      [401, 'turned away'],
      [429, 'Too many lobbies'],
      [503, 'busy'],
      [500, 'refused to open a lobby (500)'],
    ] as const) {
      const t = setup({}, { status, body: { error: 'nope' } });
      t.transport.send({ op: 'hostLobby', slots: 4 });
      await flush();
      expect(t.reports).toEqual([
        {
          type: 'lobbyFailed',
          seat: 1,
          message: expect.stringContaining(text),
        },
      ]);
    }
  });

  it('says when the relay cannot be reached at all', async () => {
    const t = setup();
    t.fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    t.transport.send({ op: 'hostLobby', slots: 4 });
    await flush();
    expect(t.reports[0]).toMatchObject({
      type: 'lobbyFailed',
      message: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('does not even try without a server or a key', async () => {
    for (const override of [{ baseUrl: '' }, { appKey: ' ' }]) {
      const t = setup(override);
      t.transport.send({ op: 'hostLobby', slots: 4 });
      await flush();
      expect(t.fetchMock).not.toHaveBeenCalled();
      expect(t.reports[0]).toMatchObject({ type: 'lobbyFailed' });
    }
  });
});

describe('joining a lobby', () => {
  it('dials with the code and no token', async () => {
    const t = await joining('abc-123');
    expect(t.fetchMock).not.toHaveBeenCalled();
    const dialled = new URL(t.socket()!.url);
    expect(dialled.searchParams.get('code')).toBe('ABC123');
    expect(dialled.searchParams.has('token')).toBe(false);
  });

  it('refuses something that is not a code', async () => {
    const t = await joining('nope');
    expect(sockets).toHaveLength(0);
    expect(t.reports[0]).toMatchObject({
      type: 'lobbyFailed',
      message: expect.stringContaining('six characters'),
    });
  });

  it('folds every relay seat onto the host link', async () => {
    const t = await joining();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 3,
      code: 'ABC123',
      slots: 4,
      peers: [1, 2],
    });
    t.socket()!.deliver({ ev: 'data', from: 1, data: 'from the host' });
    expect(t.reports).toEqual([
      { type: 'lobby', seat: 1, code: 'ABC123' },
      { type: 'open', seat: 1 },
      { type: 'message', seat: 1, data: 'from the host' },
    ]);
  });

  it('waits for the host when the lobby is empty', async () => {
    const t = await joining();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 2,
      code: 'ABC123',
      slots: 4,
      peers: [],
    });
    expect(t.reports).toEqual([{ type: 'lobby', seat: 1, code: 'ABC123' }]);
    t.socket()!.deliver({ ev: 'peer', seat: 1, state: 'open' });
    expect(t.reports.at(-1)).toEqual({ type: 'open', seat: 1 });
  });

  it('ignores another guest it can never talk to directly', async () => {
    const t = await joining();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 2,
      code: 'ABC123',
      slots: 4,
      peers: [1],
    });
    t.socket()!.deliver({ ev: 'peer', seat: 3, state: 'open' });
    t.socket()!.deliver({ ev: 'data', from: 3, data: 'sideways' });
    expect(t.reports).toHaveLength(2);
  });

  it('always addresses the host, whatever seat it holds', async () => {
    const t = await joining();
    t.transport.send({ op: 'send', seats: [1], data: 'x' });
    // A guest cannot remove anyone.
    t.transport.send({ op: 'close', seat: 2 });
    expect(t.socket()!.frames()).toEqual([{ op: 'send', to: [1], data: 'x' }]);
  });
});

describe('losing the connection', () => {
  it('explains a socket that never opened', async () => {
    const t = await joining();
    t.socket()!.hangUp(1006);
    expect(t.reports[0]).toMatchObject({
      type: 'lobbyFailed',
      message: expect.stringContaining('Could not reach'),
    });
  });

  it('uses the relay close code when there is one', async () => {
    const t = await joining();
    t.socket()!.hangUp(RelayClose.lobbyFull);
    expect(t.reports[0]).toMatchObject({
      message: expect.stringContaining('already full'),
    });
  });

  it('prefers the message the relay actually sent', async () => {
    const t = await joining();
    t.socket()!.deliver({
      ev: 'error',
      code: 'no_such_lobby',
      message: 'That lobby code is not open.',
    });
    t.socket()!.hangUp(RelayClose.noSuchLobby);
    expect(t.reports).toEqual([
      { type: 'lobbyFailed', seat: 1, message: 'That lobby code is not open.' },
      { type: 'lobbyFailed', seat: 1, message: 'That lobby code is not open.' },
    ]);
  });

  it('closes the link when a seated socket goes away', async () => {
    const t = await joining();
    t.socket()!.deliver({
      ev: 'seated',
      seat: 2,
      code: 'ABC123',
      slots: 4,
      peers: [1],
    });
    t.socket()!.hangUp(1001);
    expect(t.reports.at(-1)).toEqual({ type: 'closed', seat: 1 });
  });

  it('ignores an unreadable frame', async () => {
    const t = await joining();
    t.socket()!.deliver('not json');
    expect(t.reports).toEqual([]);
  });
});

describe('retiring', () => {
  it('closes the socket and ignores whatever it says next', async () => {
    const t = await joining();
    const socket = t.socket()!;
    t.transport.retire();
    expect(socket.closed).toEqual({ code: 1000, reason: 'left' });
    socket.deliver({
      ev: 'seated',
      seat: 2,
      code: 'ABC123',
      slots: 4,
      peers: [1],
    });
    socket.hangUp(1006);
    expect(t.reports).toEqual([]);
  });

  it('drops a lobby that finishes opening after it was retired', async () => {
    const t = setup();
    t.transport.send({ op: 'hostLobby', slots: 4 });
    t.transport.retire();
    await flush();
    expect(sockets).toHaveLength(0);
    expect(t.reports).toEqual([]);
  });

  it('sends nothing once the socket is gone', async () => {
    const t = await joining();
    const socket = t.socket()!;
    t.transport.send({ op: 'leave' });
    expect(socket.frames()).toEqual([{ op: 'leave' }]);
    socket.readyState = 3;
    t.transport.send({ op: 'send', seats: [1], data: 'x' });
    expect(socket.frames()).toHaveLength(1);
  });

  it('ignores the peer-to-peer commands entirely', async () => {
    const t = await joining();
    t.transport.send({
      op: 'host',
      seat: 2,
      config: { iceServers: [], recordWire: false },
    });
    t.transport.send({ op: 'acceptReply', seat: 2, code: 'MPM1:x' });
    expect(t.socket()!.sent).toEqual([]);
  });
});
