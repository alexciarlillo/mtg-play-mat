import { MAX_RELAY_SLOTS, MIN_RELAY_SLOTS } from '../src/shared/net/relay';

export interface AppKey {
  appId: string;
  key: string;
}

export interface RelayConfig {
  host: string;
  port: number;
  // Which apps may use this relay at all. Empty only in dev.
  appKeys: AppKey[];
  allowAnyApp: boolean;
  defaultSlots: number;
  maxLobbies: number;
  // A lobby never outlives this, however busy it is.
  lobbyTtlMs: number;
  // An empty lobby is swept this long after its last socket left.
  emptyGraceMs: number;
  maxSocketsPerIp: number;
  lobbiesPerIpPerHour: number;
  // Per connection, on data the client sends.
  bytesPerSecond: number;
  burstBytes: number;
  // Every byte one lobby relays, for its whole life.
  lobbyByteBudget: number;
  pingIntervalMs: number;
  // Behind a reverse proxy, believe X-Forwarded-For.
  trustProxy: boolean;
}

const num = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`expected a positive number, got ${JSON.stringify(value)}`);
  }
  return parsed;
};

const flag = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

// RELAY_APP_KEYS is "appId:key,appId:key". A key is a shared secret the
// client ships; it keeps drive-by scanners off, nothing more.
export const parseAppKeys = (value: string | undefined): AppKey[] => {
  if (!value || value.trim() === '') return [];
  return value.split(',').map((entry) => {
    const at = entry.indexOf(':');
    const appId = entry.slice(0, at).trim();
    const key = entry.slice(at + 1).trim();
    if (at < 0 || appId === '' || key === '') {
      throw new Error(
        `malformed RELAY_APP_KEYS entry ${JSON.stringify(entry)}`
      );
    }
    return { appId, key };
  });
};

const MINUTE = 60_000;

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env
): RelayConfig => {
  const allowAnyApp = flag(env.RELAY_ALLOW_ANY_APP);
  const appKeys = parseAppKeys(env.RELAY_APP_KEYS);
  if (appKeys.length === 0 && !allowAnyApp) {
    throw new Error(
      'set RELAY_APP_KEYS ("appId:key,…"), or RELAY_ALLOW_ANY_APP=1 in dev'
    );
  }
  const defaultSlots = num(env.RELAY_DEFAULT_SLOTS, 4);
  if (defaultSlots < MIN_RELAY_SLOTS || defaultSlots > MAX_RELAY_SLOTS) {
    throw new Error(
      `RELAY_DEFAULT_SLOTS must be ${MIN_RELAY_SLOTS}..${MAX_RELAY_SLOTS}`
    );
  }
  return {
    host: env.RELAY_HOST ?? '0.0.0.0',
    port: num(env.RELAY_PORT, 8787),
    appKeys,
    allowAnyApp,
    defaultSlots,
    maxLobbies: num(env.RELAY_MAX_LOBBIES, 500),
    lobbyTtlMs: num(env.RELAY_LOBBY_TTL_MS, 6 * 60 * MINUTE),
    emptyGraceMs: num(env.RELAY_EMPTY_GRACE_MS, 2 * MINUTE),
    maxSocketsPerIp: num(env.RELAY_MAX_SOCKETS_PER_IP, 12),
    lobbiesPerIpPerHour: num(env.RELAY_LOBBIES_PER_IP_PER_HOUR, 30),
    bytesPerSecond: num(env.RELAY_BYTES_PER_SECOND, 512 * 1024),
    burstBytes: num(env.RELAY_BURST_BYTES, 4 * 1024 * 1024),
    lobbyByteBudget: num(env.RELAY_LOBBY_BYTE_BUDGET, 2 * 1024 * 1024 * 1024),
    pingIntervalMs: num(env.RELAY_PING_INTERVAL_MS, 30_000),
    trustProxy: flag(env.RELAY_TRUST_PROXY),
  };
};
