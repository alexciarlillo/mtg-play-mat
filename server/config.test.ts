import { describe, expect, it } from 'vitest';

import { loadConfig, parseAppKeys } from './config';

describe('parseAppKeys', () => {
  it('reads a list', () => {
    expect(parseAppKeys('a:one,b:two')).toEqual([
      { appId: 'a', key: 'one' },
      { appId: 'b', key: 'two' },
    ]);
  });

  it('trims and keeps colons inside a key', () => {
    expect(parseAppKeys(' a : one:two ')).toEqual([
      { appId: 'a', key: 'one:two' },
    ]);
  });

  it('treats nothing as no keys', () => {
    expect(parseAppKeys(undefined)).toEqual([]);
    expect(parseAppKeys('  ')).toEqual([]);
  });

  it('refuses a malformed entry', () => {
    ['a', 'a:', ':one', 'a:one,b'].forEach((value) =>
      expect(() => parseAppKeys(value)).toThrow(/malformed/)
    );
  });
});

describe('loadConfig', () => {
  it('insists on keys unless dev says otherwise', () => {
    expect(() => loadConfig({})).toThrow(/RELAY_APP_KEYS/);
    expect(loadConfig({ RELAY_ALLOW_ANY_APP: '1' }).allowAnyApp).toBe(true);
  });

  it('defaults everything else', () => {
    const config = loadConfig({ RELAY_APP_KEYS: 'a:one' });
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 8787,
      defaultSlots: 4,
      trustProxy: false,
    });
  });

  it('reads the overrides', () => {
    const config = loadConfig({
      RELAY_APP_KEYS: 'a:one',
      RELAY_HOST: '127.0.0.1',
      RELAY_PORT: '9000',
      RELAY_DEFAULT_SLOTS: '2',
      RELAY_TRUST_PROXY: 'true',
    });
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 9000,
      defaultSlots: 2,
      trustProxy: true,
    });
  });

  it('refuses nonsense', () => {
    const base = { RELAY_APP_KEYS: 'a:one' };
    expect(() => loadConfig({ ...base, RELAY_PORT: 'http' })).toThrow();
    expect(() => loadConfig({ ...base, RELAY_PORT: '-1' })).toThrow();
    expect(() => loadConfig({ ...base, RELAY_DEFAULT_SLOTS: '99' })).toThrow(
      /RELAY_DEFAULT_SLOTS/
    );
  });
});
