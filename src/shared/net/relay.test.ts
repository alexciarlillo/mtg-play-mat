import { describe, expect, it } from 'vitest';

import {
  encodeRelayFrame,
  MAX_RELAY_DATA_BYTES,
  parseCreateLobbyResponse,
  parseRelayClientFrame,
  parseRelayServerFrame,
  RELAY_PROTOCOL_VERSION,
  RelayError,
  relayWebSocketUrl,
} from './relay';

const client = (frame: unknown) => parseRelayClientFrame(JSON.stringify(frame));
const server = (frame: unknown) => parseRelayServerFrame(JSON.stringify(frame));

describe('parseRelayClientFrame', () => {
  it('reads a send to named seats', () => {
    expect(client({ op: 'send', to: [2, 3], data: 'x' })).toEqual({
      op: 'send',
      to: [2, 3],
      data: 'x',
    });
  });

  it('reads a send to everyone', () => {
    expect(client({ op: 'send', to: 'all', data: 'x' })).toEqual({
      op: 'send',
      to: 'all',
      data: 'x',
    });
  });

  it('drops duplicate seats', () => {
    expect(client({ op: 'send', to: [2, 2, 3], data: 'x' })).toMatchObject({
      to: [2, 3],
    });
  });

  it('reads close and leave', () => {
    expect(client({ op: 'close', seat: 3 })).toEqual({ op: 'close', seat: 3 });
    expect(client({ op: 'leave' })).toEqual({ op: 'leave' });
  });

  it('rejects malformed frames', () => {
    const bad: unknown[] = [
      { op: 'send', to: [2] },
      { op: 'send', to: [0], data: 'x' },
      { op: 'send', to: [9], data: 'x' },
      { op: 'send', to: 'some', data: 'x' },
      { op: 'send', to: [1.5], data: 'x' },
      { op: 'send', to: [2], data: '' },
      { op: 'close' },
      { op: 'close', seat: 'three' },
      { op: 'nope' },
      [],
      null,
      'text',
    ];
    bad.forEach((frame) => expect(() => client(frame)).toThrow(RelayError));
  });

  it('rejects non-JSON and non-text', () => {
    expect(() => parseRelayClientFrame('{')).toThrow(/not JSON/);
    expect(() => parseRelayClientFrame(7)).toThrow(/not text/);
  });

  it('rejects an oversize frame before parsing it', () => {
    const huge = 'a'.repeat(MAX_RELAY_DATA_BYTES + 8192);
    expect(() => parseRelayClientFrame(huge)).toThrow(/larger than/);
  });

  it('rejects oversize data inside a legal frame', () => {
    const data = 'a'.repeat(MAX_RELAY_DATA_BYTES + 1);
    expect(() => client({ op: 'send', to: 'all', data })).toThrow(RelayError);
  });
});

describe('parseRelayServerFrame', () => {
  it('reads seated', () => {
    expect(
      server({ ev: 'seated', seat: 1, code: 'ABC123', slots: 4, peers: [2] })
    ).toEqual({ ev: 'seated', seat: 1, code: 'ABC123', slots: 4, peers: [2] });
  });

  it('defaults seated peers to nobody', () => {
    expect(
      server({ ev: 'seated', seat: 2, code: 'ABC123', slots: 4 })
    ).toMatchObject({ peers: [] });
  });

  it('reads peer, data and error', () => {
    expect(server({ ev: 'peer', seat: 2, state: 'open' })).toEqual({
      ev: 'peer',
      seat: 2,
      state: 'open',
    });
    expect(server({ ev: 'data', from: 2, data: 'x' })).toEqual({
      ev: 'data',
      from: 2,
      data: 'x',
    });
    expect(
      server({ ev: 'error', code: 'lobby_full', message: 'Full.' })
    ).toEqual({ ev: 'error', code: 'lobby_full', message: 'Full.' });
  });

  it('rejects malformed frames', () => {
    const bad: unknown[] = [
      { ev: 'seated', seat: 1, code: 'ABC123', slots: 1 },
      { ev: 'seated', seat: 1, code: 'ABC123', slots: 99 },
      { ev: 'seated', seat: 1, slots: 4 },
      { ev: 'peer', seat: 2, state: 'wobbly' },
      { ev: 'data', from: 0, data: 'x' },
      { ev: 'error', code: 'x' },
      { ev: 'nope' },
    ];
    bad.forEach((frame) => expect(() => server(frame)).toThrow(RelayError));
  });
});

describe('encodeRelayFrame', () => {
  it('round-trips through the parsers', () => {
    const frame = { op: 'send', to: 'all', data: 'hello' } as const;
    expect(parseRelayClientFrame(encodeRelayFrame(frame))).toEqual(frame);
  });
});

describe('parseCreateLobbyResponse', () => {
  const body = {
    v: RELAY_PROTOCOL_VERSION,
    code: 'ABC123',
    hostToken: 'tok',
    slots: 4,
    expiresAt: '2026-09-21T00:00:00.000Z',
  };

  it('reads a well-formed body', () => {
    expect(parseCreateLobbyResponse(JSON.stringify(body))).toEqual(body);
  });

  it('rejects another protocol version', () => {
    expect(() =>
      parseCreateLobbyResponse(JSON.stringify({ ...body, v: 99 }))
    ).toThrow(/unsupported relay version/);
  });

  it('rejects missing fields', () => {
    expect(() =>
      parseCreateLobbyResponse(JSON.stringify({ ...body, hostToken: '' }))
    ).toThrow(RelayError);
  });
});

describe('relayWebSocketUrl', () => {
  const args = { appId: 'app', appKey: 'key', code: 'ABC123' };

  it('builds a ws url from an http base', () => {
    const url = relayWebSocketUrl({
      baseUrl: 'http://localhost:8787',
      ...args,
    });
    expect(url).toBe(
      `ws://localhost:8787/v1/ws?v=${RELAY_PROTOCOL_VERSION}` +
        '&app=app&key=key&code=ABC123'
    );
  });

  it('builds a wss url from an https base, path and all', () => {
    const url = relayWebSocketUrl({
      baseUrl: 'https://relay.example.com/relay',
      ...args,
      token: 'host-token',
    });
    expect(url).toContain('wss://relay.example.com/relay/v1/ws?');
    expect(url).toContain('token=host-token');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(
      relayWebSocketUrl({ baseUrl: 'https://relay.example.com/', ...args })
    ).toContain('wss://relay.example.com/v1/ws?');
  });
});
