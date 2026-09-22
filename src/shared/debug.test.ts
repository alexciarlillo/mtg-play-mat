import { describe, expect, it } from 'vitest';

import {
  type DebugEntry,
  formatDebugEntry,
  formatDebugReport,
  formatDebugText,
  parseDebugInput,
  redactUrl,
  relayHost,
  scopedLog,
} from './debug';

const entry = (over: Partial<DebugEntry> = {}): DebugEntry => ({
  id: 1,
  at: new Date(2026, 8, 22, 9, 4, 5, 60).getTime(),
  level: 'info',
  scope: 'relay',
  text: 'lobby is open code=ABC123',
  count: 1,
  ...over,
});

describe('formatDebugText', () => {
  it('appends fields, and drops the ones with nothing to say', () => {
    expect(formatDebugText('seated', { seat: 2, name: undefined })).toBe(
      'seated seat=2'
    );
  });

  it('quotes a value that would otherwise run into the next field', () => {
    expect(
      formatDebugText('closed', { why: 'the game is full', code: 3 })
    ).toBe('closed why="the game is full" code=3');
  });
});

describe('redactUrl', () => {
  it('takes out the app key and the host token', () => {
    const url = redactUrl(
      'wss://relay.example.com/v1/ws?app=mtg&key=secret&code=ABC123&token=t0k'
    );
    expect(url).toContain('code=ABC123');
    expect(url).not.toContain('secret');
    expect(url).not.toContain('t0k');
  });

  it('says so rather than echoing something that is not a URL', () => {
    expect(redactUrl('relay.example.com')).toBe('(not a URL)');
  });
});

describe('relayHost', () => {
  it('keeps the host alone, and reports a blank or broken setting', () => {
    expect(relayHost('https://relay.example.com/base/')).toBe(
      'relay.example.com'
    );
    expect(relayHost('  ')).toBeNull();
    expect(relayHost('nonsense')).toBe('(not a URL)');
  });
});

describe('formatting a log for sharing', () => {
  it('writes a line that reads left to right', () => {
    expect(formatDebugEntry(entry())).toBe(
      '09:04:05.060 INFO  relay    lobby is open code=ABC123'
    );
  });

  it('marks a line that repeated', () => {
    expect(formatDebugEntry(entry({ count: 12 }))).toContain('×12');
  });

  it('puts the build and the relay at the top of the report', () => {
    const report = formatDebugReport({
      env: {
        appVersion: '0.3.0',
        platform: 'darwin',
        relayHost: 'relay.example.com',
        relayKeySet: true,
      },
      entries: [entry()],
    });
    expect(report.split('\n')[0]).toBe(
      'MTG Play Mat 0.3.0 · darwin · relay relay.example.com (key set)'
    );
    expect(report.split('\n')).toHaveLength(2);
  });
});

describe('parseDebugInput', () => {
  it('keeps a well-formed line and trims it to size', () => {
    const parsed = parseDebugInput({
      level: 'warn',
      scope: 'a'.repeat(40),
      text: 'b'.repeat(400),
    });
    expect(parsed?.scope).toHaveLength(16);
    expect(parsed?.text).toHaveLength(300);
  });

  it('refuses anything else', () => {
    expect(
      parseDebugInput({ level: 'shout', scope: 'a', text: 'b' })
    ).toBeNull();
    expect(parseDebugInput({ level: 'info', scope: 1, text: 'b' })).toBeNull();
    expect(parseDebugInput('info')).toBeNull();
  });
});

describe('scopedLog', () => {
  it('records at the level it was asked for, under its own scope', () => {
    const lines: string[] = [];
    const log = scopedLog(
      {
        record: (level, scope, text) => lines.push(`${level} ${scope} ${text}`),
      },
      'netplay'
    );
    log.debug('in public', { seat: 2 });
    log.error('the lobby failed');
    expect(lines).toEqual([
      'debug netplay in public seat=2',
      'error netplay the lobby failed',
    ]);
  });

  it('says nothing at all without a sink', () => {
    expect(() => scopedLog(undefined, 'netplay').info('hi')).not.toThrow();
  });
});
