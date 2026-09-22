import { describe, expect, it } from 'vitest';

import {
  cleanDisplayName,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_OPPONENT_ROW_HEIGHT,
  defaultSettings,
  MAX_OPPONENT_ROW_HEIGHT,
  MAX_TRAY_HEIGHT,
  MIN_OPPONENT_ROW_HEIGHT,
  MIN_TRAY_HEIGHT,
  parseSettings,
  parseSettingsPatch,
} from './settings';

const BELL = String.fromCharCode(7);

describe('parseSettings', () => {
  it('fills every key with its default', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings);
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings([])).toEqual(defaultSettings);
    expect(defaultSettings).toEqual({
      displayName: DEFAULT_DISPLAY_NAME,
      turnTracking: false,
      tablePanel: { x: 1, y: 1, collapsed: false },
      handInBoard: true,
      handTray: { height: 280, collapsed: false },
      opponentRow: DEFAULT_OPPONENT_ROW_HEIGHT,
      relayUrl: '',
      relayKey: '',
    });
  });

  it('migrates a file that only has a display name', () => {
    expect(parseSettings({ displayName: 'Alice' })).toEqual({
      ...defaultSettings,
      displayName: 'Alice',
    });
  });

  it('keeps valid values and replaces invalid ones with defaults', () => {
    expect(
      parseSettings({ displayName: 42, turnTracking: 'yes', unknown: 1 })
    ).toEqual(defaultSettings);
    expect(parseSettings({ turnTracking: true })).toEqual({
      ...defaultSettings,
      turnTracking: true,
    });
  });
});

describe('parseSettingsPatch', () => {
  it('keeps only known keys with valid values', () => {
    expect(
      parseSettingsPatch({ turnTracking: true, displayName: 7, other: 'x' })
    ).toEqual({ turnTracking: true });
    expect(parseSettingsPatch('turnTracking')).toEqual({});
    expect(parseSettingsPatch({})).toEqual({});
  });

  it('cleans a display name', () => {
    expect(parseSettingsPatch({ displayName: `  Bob${BELL} ` })).toEqual({
      displayName: 'Bob',
    });
    expect(parseSettingsPatch({ displayName: '' })).toEqual({
      displayName: DEFAULT_DISPLAY_NAME,
    });
  });
});

describe('cleanDisplayName', () => {
  it('trims, strips control characters, and caps the length', () => {
    expect(cleanDisplayName(' Al\nice ')).toBe('Alice');
    expect(cleanDisplayName('x'.repeat(40))).toHaveLength(32);
    expect(cleanDisplayName(undefined)).toBe(DEFAULT_DISPLAY_NAME);
  });
});

describe('tablePanel', () => {
  it('keeps a valid placement and clamps it to the field', () => {
    expect(
      parseSettingsPatch({ tablePanel: { x: 0.2, y: 0, collapsed: true } })
    ).toEqual({ tablePanel: { x: 0.2, y: 0, collapsed: true } });
    expect(
      parseSettingsPatch({ tablePanel: { x: -3, y: 9, collapsed: false } })
    ).toEqual({ tablePanel: { x: 0, y: 1, collapsed: false } });
  });

  it('drops a malformed placement', () => {
    [
      null,
      'corner',
      { x: 0.5, y: 0.5 },
      { x: '0.5', y: 0.5, collapsed: false },
      { x: Number.NaN, y: 0.5, collapsed: false },
      { x: 0.5, y: Infinity, collapsed: false },
    ].forEach((tablePanel) => {
      expect(parseSettingsPatch({ tablePanel })).toEqual({});
    });
    expect(parseSettings({ tablePanel: [1, 1] }).tablePanel).toEqual(
      defaultSettings.tablePanel
    );
  });
});

describe('handInBoard', () => {
  it('is on unless a saved boolean says otherwise', () => {
    expect(parseSettings({}).handInBoard).toBe(true);
    expect(parseSettings({ handInBoard: false }).handInBoard).toBe(false);
    expect(parseSettings({ handInBoard: 'yes' }).handInBoard).toBe(true);
  });
});

describe('opponentRow', () => {
  it('keeps a valid height and clamps it', () => {
    expect(parseSettingsPatch({ opponentRow: 420.6 })).toEqual({
      opponentRow: 421,
    });
    expect(parseSettingsPatch({ opponentRow: 5 })).toEqual({
      opponentRow: MIN_OPPONENT_ROW_HEIGHT,
    });
    expect(parseSettingsPatch({ opponentRow: 1e6 })).toEqual({
      opponentRow: MAX_OPPONENT_ROW_HEIGHT,
    });
  });

  it('drops a height that is not a finite number', () => {
    ['320', Number.NaN, null, {}].forEach((opponentRow) => {
      expect(parseSettingsPatch({ opponentRow })).toEqual({});
    });
  });
});

describe('handTray', () => {
  it('keeps a valid tray and clamps its height', () => {
    expect(
      parseSettingsPatch({ handTray: { height: 300.4, collapsed: true } })
    ).toEqual({ handTray: { height: 300, collapsed: true } });
    expect(
      parseSettingsPatch({ handTray: { height: 5, collapsed: false } })
    ).toEqual({ handTray: { height: MIN_TRAY_HEIGHT, collapsed: false } });
    expect(
      parseSettingsPatch({ handTray: { height: 1e6, collapsed: false } })
    ).toEqual({ handTray: { height: MAX_TRAY_HEIGHT, collapsed: false } });
  });

  it('drops a malformed tray', () => {
    [
      null,
      { height: 200 },
      { height: '200', collapsed: false },
      { height: Number.NaN, collapsed: false },
    ].forEach((handTray) => {
      expect(parseSettingsPatch({ handTray })).toEqual({});
    });
  });
});

describe('relay settings', () => {
  it('takes an http or https address', () => {
    expect(
      parseSettingsPatch({ relayUrl: 'https://relay.example.com' })
    ).toEqual({ relayUrl: 'https://relay.example.com' });
    expect(parseSettingsPatch({ relayUrl: ' http://localhost:8787 ' })).toEqual(
      {
        relayUrl: 'http://localhost:8787',
      }
    );
  });

  it('takes blank, which turns lobby codes off', () => {
    expect(parseSettingsPatch({ relayUrl: '   ' })).toEqual({ relayUrl: '' });
  });

  it('drops anything that is not a web address', () => {
    ['relay.example.com', 'ws://relay.example.com', 'file:///x', 7].forEach(
      (relayUrl) => expect(parseSettingsPatch({ relayUrl })).toEqual({})
    );
  });

  it('strips whitespace out of a key', () => {
    expect(parseSettingsPatch({ relayKey: ' abc 123 ' })).toEqual({
      relayKey: 'abc123',
    });
    expect(parseSettingsPatch({ relayKey: 7 })).toEqual({});
  });

  it('defaults both to blank', () => {
    expect(defaultSettings.relayUrl).toBe('');
    expect(defaultSettings.relayKey).toBe('');
  });
});
