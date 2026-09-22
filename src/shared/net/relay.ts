// The relay wire contract, shared by the Electron client and the server
// in `server/`. The relay is a dumb pipe: it addresses seats and moves
// opaque strings, and never looks inside `data`.

export const RELAY_PROTOCOL_VERSION = 1;

// The host always takes the first seat, as it does in a peer-to-peer pod.
export const HOST_RELAY_SEAT = 1;

export const MIN_RELAY_SLOTS = 2;
export const MAX_RELAY_SLOTS = 8;

// A frame has to carry a whole game message (256 KB) plus its envelope.
export const MAX_RELAY_DATA_BYTES = 256 * 1024;
export const MAX_RELAY_FRAME_BYTES = MAX_RELAY_DATA_BYTES + 4096;

export const MAX_APP_ID_LENGTH = 64;
export const MAX_APP_KEY_LENGTH = 128;
export const MAX_TOKEN_LENGTH = 128;

// Application close codes. 4000-4999 is the range reserved for us.
export const RelayClose = {
  unauthorized: 4001,
  noSuchLobby: 4002,
  lobbyFull: 4003,
  badFrame: 4004,
  rateLimited: 4005,
  lobbyClosed: 4008,
  removed: 4009,
  serverGoingAway: 4010,
} as const;

export type RelayCloseCode = (typeof RelayClose)[keyof typeof RelayClose];

// Client -> server. `to` is a list of seats, or every other seat.
export type RelayClientFrame =
  | { op: 'send'; to: number[] | 'all'; data: string }
  // Host only: drop whoever holds that seat.
  | { op: 'close'; seat: number }
  | { op: 'leave' };

// Server -> client.
export type RelayServerFrame =
  // Always first: which seat you got and who is already here.
  | { ev: 'seated'; seat: number; code: string; slots: number; peers: number[] }
  | { ev: 'peer'; seat: number; state: 'open' | 'closed' }
  | { ev: 'data'; from: number; data: string }
  // `code` is machine-readable; `message` is for the user.
  | { ev: 'error'; code: string; message: string };

export interface CreateLobbyRequest {
  slots: number;
}

export interface CreateLobbyResponse {
  v: typeof RELAY_PROTOCOL_VERSION;
  code: string;
  hostToken: string;
  slots: number;
  expiresAt: string;
}

export class RelayError extends Error {
  constructor(message: string) {
    super(`bad relay frame: ${message}`);
    this.name = 'RelayError';
  }
}

type Fields = Record<string, unknown>;

const fail = (message: string): never => {
  throw new RelayError(message);
};

const object = (value: unknown, what: string): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : fail(`${what} must be an object`);

const text = (fields: Fields, key: string, max: number): string => {
  const value = fields[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    return fail(`${key} must be a string of 1..${max} chars`);
  }
  return value;
};

const seat = (value: unknown, what: string): number =>
  Number.isInteger(value) &&
  (value as number) >= HOST_RELAY_SEAT &&
  (value as number) <= MAX_RELAY_SLOTS
    ? (value as number)
    : fail(`${what} must be a seat number`);

const seats = (value: unknown): number[] | 'all' => {
  if (value === 'all') return 'all';
  if (!Array.isArray(value) || value.length > MAX_RELAY_SLOTS) {
    return fail('to must be "all" or a list of seats');
  }
  return [...new Set(value.map((item) => seat(item, 'to')))];
};

const byteLength = (raw: string) => new TextEncoder().encode(raw).length;

const json = (raw: unknown, limit: number): Fields => {
  if (typeof raw !== 'string') return fail('not text');
  if (raw.length > limit || byteLength(raw) > limit) {
    return fail(`larger than ${limit} bytes`);
  }
  try {
    return object(JSON.parse(raw), 'frame');
  } catch (err) {
    return err instanceof RelayError ? fail(err.message) : fail('not JSON');
  }
};

export const parseRelayClientFrame = (raw: unknown): RelayClientFrame => {
  const fields = json(raw, MAX_RELAY_FRAME_BYTES);
  switch (fields.op) {
    case 'send':
      return {
        op: 'send',
        to: seats(fields.to),
        data: text(fields, 'data', MAX_RELAY_DATA_BYTES),
      };
    case 'close':
      return { op: 'close', seat: seat(fields.seat, 'seat') };
    case 'leave':
      return { op: 'leave' };
    default:
      return fail(`unknown op ${JSON.stringify(fields.op)}`);
  }
};

export const parseRelayServerFrame = (raw: unknown): RelayServerFrame => {
  const fields = json(raw, MAX_RELAY_FRAME_BYTES);
  switch (fields.ev) {
    case 'seated': {
      const slots = fields.slots;
      if (
        !Number.isInteger(slots) ||
        (slots as number) < MIN_RELAY_SLOTS ||
        (slots as number) > MAX_RELAY_SLOTS
      ) {
        return fail('slots is out of range');
      }
      return {
        ev: 'seated',
        seat: seat(fields.seat, 'seat'),
        code: text(fields, 'code', 32),
        slots: slots as number,
        peers: seats(fields.peers ?? []) as number[],
      };
    }
    case 'peer': {
      const state = fields.state;
      if (state !== 'open' && state !== 'closed') return fail('bad peer state');
      return { ev: 'peer', seat: seat(fields.seat, 'seat'), state };
    }
    case 'data':
      return {
        ev: 'data',
        from: seat(fields.from, 'from'),
        data: text(fields, 'data', MAX_RELAY_DATA_BYTES),
      };
    case 'error':
      return {
        ev: 'error',
        code: text(fields, 'code', 64),
        message: text(fields, 'message', 500),
      };
    default:
      return fail(`unknown ev ${JSON.stringify(fields.ev)}`);
  }
};

export const encodeRelayFrame = (
  frame: RelayClientFrame | RelayServerFrame
): string => JSON.stringify(frame);

export const parseCreateLobbyResponse = (raw: unknown): CreateLobbyResponse => {
  const fields = json(raw, 4096);
  if (fields.v !== RELAY_PROTOCOL_VERSION) {
    return fail(`unsupported relay version ${JSON.stringify(fields.v)}`);
  }
  const slots = fields.slots;
  if (
    !Number.isInteger(slots) ||
    (slots as number) < MIN_RELAY_SLOTS ||
    (slots as number) > MAX_RELAY_SLOTS
  ) {
    return fail('slots is out of range');
  }
  return {
    v: RELAY_PROTOCOL_VERSION,
    code: text(fields, 'code', 32),
    hostToken: text(fields, 'hostToken', MAX_TOKEN_LENGTH),
    slots: slots as number,
    expiresAt: text(fields, 'expiresAt', 64),
  };
};

export interface RelayCredentials {
  baseUrl: string;
  appId: string;
  appKey: string;
}

const relayUrl = (
  path: string,
  { baseUrl, appId, appKey }: RelayCredentials
) => {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('v', String(RELAY_PROTOCOL_VERSION));
  url.searchParams.set('app', appId);
  url.searchParams.set('key', appKey);
  return url;
};

// Lobby creation sends its credentials in headers *and* in the query.
// The query is what a reverse proxy in front of the relay can gate on
// with one rule, since the WebSocket endpoint has nowhere else to put
// them.
export const createLobbyUrl = (credentials: RelayCredentials): string =>
  relayUrl('v1/lobbies', credentials).toString();

// The WebSocket URL a client dials. Everything travels in the query
// because the browser WebSocket API cannot set request headers.
export const relayWebSocketUrl = ({
  baseUrl,
  appId,
  appKey,
  code,
  token,
}: RelayCredentials & { code: string; token?: string }): string => {
  const url = relayUrl('v1/ws', { baseUrl, appId, appKey });
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('code', code);
  if (token) url.searchParams.set('token', token);
  return url.toString();
};
