import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import {
  parseSettings,
  parseSettingsPatch,
  type Settings,
} from '@shared/settings';

type Listener = (next: Settings, previous: Settings) => void;

// Preferences live in one JSON file in the user data directory. Reads
// never fail: a missing or corrupt file just means defaults.
export default class SettingsStore {
  private current: Settings;

  private readonly listeners = new Set<Listener>();

  constructor(private readonly filePath: string) {
    this.current = this.load();
  }

  get settings(): Settings {
    return this.current;
  }

  // Applies the valid part of a renderer's patch and tells every listener
  // when something actually changed.
  update = (input: unknown): Settings => {
    const patch = parseSettingsPatch(input);
    const previous = this.current;
    const next = { ...previous, ...patch };
    // Compared as JSON because some values are objects, rebuilt by
    // every parse even when nothing in them changed.
    const changed = (Object.keys(patch) as (keyof Settings)[]).some(
      (key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key])
    );
    if (!changed) return previous;
    this.current = next;
    this.save();
    this.listeners.forEach((listener) => listener(next, previous));
    return next;
  };

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private load(): Settings {
    try {
      return parseSettings(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      return parseSettings({});
    }
  }

  // Written beside the real file and renamed over it, so a crash mid-write
  // cannot leave a truncated file that would reset every setting.
  private save() {
    const temp = `${this.filePath}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(this.current, null, 2));
      renameSync(temp, this.filePath);
    } catch (err) {
      console.error('[settings] could not save settings', err);
    }
  }
}
