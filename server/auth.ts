import { timingSafeEqual } from 'node:crypto';

import { MAX_APP_ID_LENGTH, MAX_APP_KEY_LENGTH } from '../src/shared/net/relay';
import type { RelayConfig } from './config';

export interface Credentials {
  appId: string | null;
  appKey: string | null;
  ip: string;
}

export interface Principal {
  appId: string;
}

// The one authorization seam. Today it is a shared key per app, which
// only keeps drive-by scanners off a public endpoint. Anything stronger
// later — proof of work, signed tokens, per-user keys — replaces this
// function without touching the rest of the server.
export type Authenticator = (creds: Credentials) => Principal | null;

const sameSecret = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Compare something of equal length either way, so the mismatch does
  // not leak through how long the check took.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
};

export const createAuthenticator = (config: RelayConfig): Authenticator => {
  const keys = new Map(config.appKeys.map((entry) => [entry.appId, entry.key]));
  return ({ appId, appKey }) => {
    if (
      !appId ||
      !appKey ||
      appId.length > MAX_APP_ID_LENGTH ||
      appKey.length > MAX_APP_KEY_LENGTH
    ) {
      return null;
    }
    if (config.allowAnyApp && keys.size === 0) return { appId };
    const expected = keys.get(appId);
    if (expected === undefined || !sameSecret(expected, appKey)) return null;
    return { appId };
  };
};
