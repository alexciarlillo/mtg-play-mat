import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { defaultSettings } from '@shared/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileStore from '../netplay/ProfileStore';
import SettingsStore from './SettingsStore';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtg-settings-'));
  file = path.join(dir, 'settings.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const saved = () => JSON.parse(readFileSync(file, 'utf8')) as unknown;

describe('SettingsStore', () => {
  it('starts from defaults without a file', () => {
    expect(new SettingsStore(file).settings).toEqual(defaultSettings);
  });

  it('falls back to defaults for a corrupt file', () => {
    writeFileSync(file, '{ not json');
    expect(new SettingsStore(file).settings).toEqual(defaultSettings);
  });

  it('loads an old display-name-only file and keeps the name', () => {
    writeFileSync(file, JSON.stringify({ displayName: 'Alice' }));
    const store = new SettingsStore(file);
    expect(store.settings).toEqual({
      ...defaultSettings,
      displayName: 'Alice',
    });

    store.update({ turnTracking: true });
    expect(saved()).toEqual({ displayName: 'Alice', turnTracking: true });
    expect(new SettingsStore(file).settings).toEqual({
      displayName: 'Alice',
      turnTracking: true,
    });
  });

  it('applies only valid changes and notifies listeners once', () => {
    const store = new SettingsStore(file);
    const listener = vi.fn();
    store.onChange(listener);

    expect(store.update({ turnTracking: 'on', bogus: 1 })).toEqual(
      defaultSettings
    );
    expect(store.update({ turnTracking: false })).toEqual(defaultSettings);
    expect(listener).not.toHaveBeenCalled();

    const next = store.update({ turnTracking: true });
    expect(next.turnTracking).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(next, defaultSettings);
  });

  it('backs the profile display name', () => {
    const store = new SettingsStore(file);
    const profile = new ProfileStore(store);
    store.update({ displayName: '  Bob ' });
    expect(profile.name).toBe('Bob');
    store.update({ displayName: 'Carol' });
    expect(profile.profile.displayName).toBe('Carol');
    expect(saved()).toMatchObject({ displayName: 'Carol' });
  });
});
