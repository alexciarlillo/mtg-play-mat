// Test-only helpers: a real relay on an ephemeral port and a thin client
// over Node's global WebSocket, so the tests exercise the whole stack.
import {
  parseRelayServerFrame,
  type RelayClientFrame,
  type RelayServerFrame,
  relayWebSocketUrl,
} from '../src/shared/net/relay';
import { loadConfig, type RelayConfig } from './config';
import { createRelayServer } from './server';

export const APP_ID = 'test-app';
export const APP_KEY = 'test-key';

export const testConfig = (
  overrides: Partial<RelayConfig> = {}
): RelayConfig => ({
  ...loadConfig({ RELAY_APP_KEYS: `${APP_ID}:${APP_KEY}` }),
  host: '127.0.0.1',
  port: 0,
  pingIntervalMs: 60_000,
  ...overrides,
});

export const startRelay = async (overrides: Partial<RelayConfig> = {}) => {
  const relay = createRelayServer(testConfig(overrides));
  const { port } = await relay.listen();
  return {
    relay,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => relay.close(),
  };
};

// `where` says which way the credentials travel, so tests can cover the
// header path, the query path, and neither.
export const createLobby = async (
  baseUrl: string,
  {
    appId = APP_ID,
    appKey = APP_KEY,
    body = {} as unknown,
    where = 'header' as 'header' | 'query' | 'none',
  } = {}
) => {
  const url = new URL('/v1/lobbies', baseUrl);
  if (where === 'query') {
    url.searchParams.set('app', appId);
    url.searchParams.set('key', appKey);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(where === 'header' && { 'x-app-id': appId, 'x-app-key': appKey }),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};

export interface Closed {
  code: number;
  reason: string;
}

// Collects frames so a test can await the next one without racing.
export class TestClient {
  readonly frames: RelayServerFrame[] = [];

  readonly closed: Promise<Closed>;

  private readonly pending: ((frame: RelayServerFrame) => void)[] = [];

  private readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event: MessageEvent) => {
      const frame = parseRelayServerFrame(String(event.data));
      const waiter = this.pending.shift();
      if (waiter) waiter(frame);
      else this.frames.push(frame);
    });
    this.closed = new Promise((resolve) => {
      this.socket.addEventListener('close', (event: CloseEvent) =>
        resolve({ code: event.code, reason: event.reason })
      );
    });
  }

  next(): Promise<RelayServerFrame> {
    const buffered = this.frames.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => this.pending.push(resolve));
  }

  send(frame: RelayClientFrame | string): void {
    this.socket.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
  }

  sendRaw(data: string | Uint8Array<ArrayBuffer>): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }
}

export const dial = (
  baseUrl: string,
  {
    code,
    token,
    appId = APP_ID,
    appKey = APP_KEY,
    version,
  }: {
    code: string;
    token?: string;
    appId?: string;
    appKey?: string;
    version?: string;
  }
) => {
  let url = relayWebSocketUrl({ baseUrl, appId, appKey, code, token });
  if (version !== undefined) url = url.replace(/([?&])v=\d+/, `$1v=${version}`);
  return new TestClient(url);
};

// Dials and waits for the seat, which is always the first frame.
export const seatedAt = async (client: TestClient): Promise<number> => {
  const frame = await client.next();
  if (frame.ev !== 'seated') {
    throw new Error(`expected seated, got ${JSON.stringify(frame)}`);
  }
  return frame.seat;
};
