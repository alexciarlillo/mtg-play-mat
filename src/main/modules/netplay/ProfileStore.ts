import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import type { Profile } from '@shared/net/lobby';

export const DEFAULT_DISPLAY_NAME = 'Player';
const MAX_NAME_LENGTH = 32;

export const cleanDisplayName = (input: unknown): string => {
  if (typeof input !== 'string') return DEFAULT_DISPLAY_NAME;
  // Control characters would only garble the opponent's board.
  const name = input
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name || DEFAULT_DISPLAY_NAME;
};

// The display name persists in a small settings file. The player id is new
// every launch, so two copies of the app never share one.
export default class ProfileStore {
  readonly playerId = randomUUID();

  private displayName: string;

  constructor(private readonly settingsPath: string) {
    this.displayName = this.load();
  }

  get profile(): Profile {
    return { playerId: this.playerId, displayName: this.displayName };
  }

  get name(): string {
    return this.displayName;
  }

  setDisplayName = (input: unknown): Profile => {
    this.displayName = cleanDisplayName(input);
    try {
      writeFileSync(
        this.settingsPath,
        JSON.stringify({ displayName: this.displayName }, null, 2)
      );
    } catch (err) {
      console.error('[profile] could not save settings', err);
    }
    return this.profile;
  };

  private load(): string {
    try {
      const saved = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as {
        displayName?: unknown;
      };
      return cleanDisplayName(saved.displayName);
    } catch {
      return DEFAULT_DISPLAY_NAME;
    }
  }
}
