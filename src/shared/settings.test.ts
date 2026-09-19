import { describe, expect, it } from 'vitest';

import {
  cleanDisplayName,
  DEFAULT_DISPLAY_NAME,
  defaultSettings,
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
