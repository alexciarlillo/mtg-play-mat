import { describe, expect, it } from 'vitest';

import { createAuthenticator } from './auth';
import { loadConfig } from './config';

const auth = (env: Record<string, string>) =>
  createAuthenticator(loadConfig(env));

const creds = (appId: string | null, appKey: string | null) => ({
  appId,
  appKey,
  ip: '127.0.0.1',
});

describe('createAuthenticator', () => {
  it('admits a known app with the right key', () => {
    const check = auth({ RELAY_APP_KEYS: 'a:one,b:two' });
    expect(check(creds('a', 'one'))).toEqual({ appId: 'a' });
    expect(check(creds('b', 'two'))).toEqual({ appId: 'b' });
  });

  it('turns away everything else', () => {
    const check = auth({ RELAY_APP_KEYS: 'a:one' });
    expect(check(creds('a', 'two'))).toBeNull();
    expect(check(creds('b', 'one'))).toBeNull();
    expect(check(creds('a', null))).toBeNull();
    expect(check(creds(null, 'one'))).toBeNull();
    expect(check(creds('a', ''))).toBeNull();
    // A near-miss of a different length must not pass either.
    expect(check(creds('a', 'onetwo'))).toBeNull();
  });

  it('caps how long an id or key may be', () => {
    const check = auth({ RELAY_APP_KEYS: 'a:one' });
    expect(check(creds('a'.repeat(200), 'one'))).toBeNull();
    expect(check(creds('a', 'o'.repeat(200)))).toBeNull();
  });

  it('lets anyone in only when dev says so and no keys are set', () => {
    expect(auth({ RELAY_ALLOW_ANY_APP: '1' })(creds('any', 'thing'))).toEqual({
      appId: 'any',
    });
    const both = auth({ RELAY_ALLOW_ANY_APP: '1', RELAY_APP_KEYS: 'a:one' });
    expect(both(creds('any', 'thing'))).toBeNull();
    expect(both(creds('a', 'one'))).toEqual({ appId: 'a' });
  });
});
