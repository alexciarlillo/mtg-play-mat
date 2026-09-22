// @vitest-environment node
import type { DebugEnv } from '@shared/debug';
import { describe, expect, it, vi } from 'vitest';

import DebugLog, { MAX_DEBUG_ENTRIES } from './debugLog';

const env: DebugEnv = {
  appVersion: '0.3.0',
  platform: 'darwin',
  relayHost: 'relay.example.com',
  relayKeySet: true,
};

const quiet = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

const setup = () => {
  let now = 1000;
  const changes: number[] = [];
  const log = new DebugLog({
    env: () => env,
    onChange: () => changes.push(1),
    now: () => (now += 10),
    console: quiet,
  });
  return {
    log,
    changes,
    texts: () => log.snapshot().entries.map((e) => e.text),
  };
};

describe('DebugLog', () => {
  it('hands out the entries with the build they came from', () => {
    const { log } = setup();
    log.scoped('relay').info('dialling');
    expect(log.snapshot()).toMatchObject({
      env,
      entries: [{ level: 'info', scope: 'relay', text: 'dialling', count: 1 }],
    });
  });

  it('collapses a line that repeats, keeping the latest time', () => {
    const { log, texts } = setup();
    const relay = log.scoped('netplay');
    relay.debug('out public', { to: '2' });
    relay.debug('out public', { to: '2' });
    relay.debug('out public', { to: '2' });
    relay.info('leaving the pod');
    const entries = log.snapshot().entries;
    expect(texts()).toEqual(['out public to=2', 'leaving the pod']);
    expect(entries[0]).toMatchObject({ count: 3, at: 1030 });
  });

  it('keeps only the most recent entries', () => {
    const { log } = setup();
    for (let i = 0; i < MAX_DEBUG_ENTRIES + 50; i += 1) {
      log.scoped('netplay').debug(`line ${i}`);
    }
    const entries = log.snapshot().entries;
    expect(entries).toHaveLength(MAX_DEBUG_ENTRIES);
    expect(entries[0].text).toBe('line 50');
  });

  it('records an exception with where it came from', () => {
    const { log } = setup();
    log.caught('app', 'uncaught exception', new TypeError('nope'));
    const [entry] = log.snapshot().entries;
    expect(entry.level).toBe('error');
    expect(entry.text).toContain('uncaught exception');
    expect(entry.text).toContain('TypeError: nope');
  });

  it('records whatever was thrown, even when it is not an Error', () => {
    const { log } = setup();
    log.caught('app', 'unhandled rejection', 'just a string');
    expect(log.snapshot().entries[0].text).toContain('just a string');
  });

  it('empties on request, and says so', () => {
    const { log, changes } = setup();
    log.scoped('relay').info('dialling');
    const after = log.clear();
    expect(after.entries).toEqual([]);
    expect(changes).toHaveLength(2);
  });
});
