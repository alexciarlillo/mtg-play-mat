import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocket, WebSocketServer } from 'ws';

import { normalizeLobbyCode } from '../src/shared/net/lobbyCode';
import {
  encodeRelayFrame,
  HOST_RELAY_SEAT,
  MAX_RELAY_FRAME_BYTES,
  MAX_RELAY_SLOTS,
  MIN_RELAY_SLOTS,
  parseRelayClientFrame,
  RELAY_PROTOCOL_VERSION,
  RelayClose,
  type RelayCloseCode,
  RelayError,
  type RelayServerFrame,
} from '../src/shared/net/relay';
import { type Authenticator, createAuthenticator } from './auth';
import type { RelayConfig } from './config';
import { SlidingCounter, TokenBucket } from './limits';
import { type Connection, LobbyRegistry } from './lobbies';

const SWEEP_MS = 15_000;

const MAX_BODY_BYTES = 4096;

const json = (res: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
};

const header = (req: IncomingMessage, name: string): string | null => {
  const value = req.headers[name];
  return typeof value === 'string' ? value : null;
};

const clientIp = (req: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwarded = header(req, 'x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_BODY_BYTES) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

export interface RelayServer {
  server: Server;
  listen(): Promise<{ port: number }>;
  close(): Promise<void>;
  stats(): { lobbies: number; connections: number };
}

export const createRelayServer = (
  config: RelayConfig,
  authenticate: Authenticator = createAuthenticator(config)
): RelayServer => {
  const lobbies = new LobbyRegistry(config);
  const creations = new SlidingCounter(config.lobbiesPerIpPerHour, 3_600_000);
  const socketsPerIp = new Map<string, number>();

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_RELAY_FRAME_BYTES,
  });

  const createLobby = async (req: IncomingMessage, res: ServerResponse) => {
    const ip = clientIp(req, config.trustProxy);
    const principal = authenticate({
      appId: header(req, 'x-app-id'),
      appKey: header(req, 'x-app-key'),
      ip,
    });
    if (!principal) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    if (!creations.allow(ip)) {
      json(res, 429, { error: 'too_many_lobbies' });
      return;
    }
    if (lobbies.full) {
      json(res, 503, { error: 'relay_busy' });
      return;
    }

    let slots = config.defaultSlots;
    try {
      const body = await readBody(req);
      if (body.trim() !== '') {
        const parsed: unknown = JSON.parse(body);
        const asked = (parsed as { slots?: unknown }).slots;
        if (asked !== undefined) {
          if (
            !Number.isInteger(asked) ||
            (asked as number) < MIN_RELAY_SLOTS ||
            (asked as number) > MAX_RELAY_SLOTS
          ) {
            json(res, 400, { error: 'bad_slots' });
            return;
          }
          slots = asked as number;
        }
      }
    } catch {
      json(res, 400, { error: 'bad_body' });
      return;
    }

    const lobby = lobbies.create(principal.appId, slots);
    json(res, 201, {
      v: RELAY_PROTOCOL_VERSION,
      code: lobby.code,
      hostToken: lobby.hostToken,
      slots: lobby.slots,
      expiresAt: new Date(lobby.expiresAt).toISOString(),
    });
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay.invalid');
    if (req.method === 'GET' && url.pathname === '/healthz') {
      json(res, 200, { ok: true, v: RELAY_PROTOCOL_VERSION });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/lobbies') {
      void createLobby(req, res).catch(() => {
        json(res, 400, { error: 'bad_request' });
      });
      return;
    }
    json(res, 404, { error: 'not_found' });
  });

  // Anything that fails here is a scanner or a broken client, and gets a
  // bare HTTP error with no upgrade. Lobby problems are different: those
  // upgrade first, so the app can show the user why.
  const rejectUpgrade = (socket: Duplex, status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nconnection: close\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://relay.invalid');
    if (url.pathname !== '/v1/ws') {
      rejectUpgrade(socket, '404 Not Found');
      return;
    }
    if (url.searchParams.get('v') !== String(RELAY_PROTOCOL_VERSION)) {
      rejectUpgrade(socket, '426 Upgrade Required');
      return;
    }
    const ip = clientIp(req, config.trustProxy);
    const principal = authenticate({
      appId: url.searchParams.get('app'),
      appKey: url.searchParams.get('key'),
      ip,
    });
    if (!principal) {
      rejectUpgrade(socket, '401 Unauthorized');
      return;
    }
    if ((socketsPerIp.get(ip) ?? 0) >= config.maxSocketsPerIp) {
      rejectUpgrade(socket, '429 Too Many Requests');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attach(ws, {
        ip,
        appId: principal.appId,
        code: normalizeLobbyCode(url.searchParams.get('code')),
        token: url.searchParams.get('token'),
      });
    });
  });

  interface Attachment {
    ip: string;
    appId: string;
    code: string | null;
    token: string | null;
  }

  function attach(ws: WebSocket, { ip, appId, code, token }: Attachment) {
    const send = (frame: RelayServerFrame) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeRelayFrame(frame));
    };
    // Tell the client what went wrong before hanging up on it.
    const reject = (
      closeCode: RelayCloseCode,
      errorCode: string,
      message: string
    ) => {
      send({ ev: 'error', code: errorCode, message });
      ws.close(closeCode, errorCode);
    };

    const lobby = code ? lobbies.get(code) : undefined;
    if (!lobby || lobby.appId !== appId) {
      reject(
        RelayClose.noSuchLobby,
        'no_such_lobby',
        'That lobby code is not open. Check it, or ask for a new one.'
      );
      return;
    }
    const isHost = token !== null && token === lobby.hostToken;
    const seat = lobbies.claimSeat(lobby, isHost);
    if (seat === 'lobbyFull' || seat === 'noSuchLobby') {
      reject(RelayClose.lobbyFull, 'lobby_full', 'That game is already full.');
      return;
    }

    socketsPerIp.set(ip, (socketsPerIp.get(ip) ?? 0) + 1);
    const bucket = new TokenBucket(config.bytesPerSecond, config.burstBytes);
    let alive = true;
    let parted = false;

    const connection: Connection = {
      send,
      close: (closeCode, reason) => ws.close(closeCode, reason),
    };

    const part = () => {
      if (parted) return;
      parted = true;
      socketsPerIp.set(ip, Math.max(0, (socketsPerIp.get(ip) ?? 1) - 1));
      if (socketsPerIp.get(ip) === 0) socketsPerIp.delete(ip);
      lobbies.part(lobby, seat);
    };

    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, config.pingIntervalMs);

    ws.on('message', (raw: Buffer, isBinary: boolean) => {
      if (isBinary) {
        reject(RelayClose.badFrame, 'bad_frame', 'Frames must be text.');
        return;
      }
      if (!bucket.take(raw.length)) {
        reject(RelayClose.rateLimited, 'rate_limited', 'Slow down.');
        return;
      }
      let frame;
      try {
        frame = parseRelayClientFrame(raw.toString('utf8'));
      } catch (err) {
        reject(
          RelayClose.badFrame,
          'bad_frame',
          err instanceof RelayError ? err.message : 'Unreadable frame.'
        );
        return;
      }
      switch (frame.op) {
        case 'send':
          lobbies.relay(lobby, seat, frame.to, frame.data);
          return;
        case 'close':
          if (seat === HOST_RELAY_SEAT && frame.seat !== seat)
            lobbies.remove(lobby, frame.seat);
          return;
        case 'leave':
          part();
          ws.close(1000, 'left');
          return;
        default:
          return;
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      part();
    });
    ws.on('error', () => ws.terminate());

    lobbies.join(lobby, seat, connection);
  }

  const sweeper = setInterval(() => {
    lobbies.sweep();
    creations.sweep();
  }, SWEEP_MS);
  sweeper.unref();

  return {
    server,
    listen: () =>
      new Promise((resolve) => {
        server.listen(config.port, config.host, () => {
          const address = server.address();
          resolve({
            port:
              typeof address === 'object' && address
                ? address.port
                : config.port,
          });
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        lobbies.shutdown();
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
    stats: () => ({
      lobbies: lobbies.size,
      connections: lobbies.connections,
    }),
  };
};
