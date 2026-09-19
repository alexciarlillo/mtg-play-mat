import { randomUUID } from 'node:crypto';

import type { Profile } from '@shared/net/lobby';

import type SettingsStore from '../settings/SettingsStore';

// The display name is a setting. The player id is new every launch, so
// two copies of the app never share one.
export default class ProfileStore {
  readonly playerId = randomUUID();

  constructor(private readonly settings: SettingsStore) {}

  get profile(): Profile {
    return { playerId: this.playerId, displayName: this.name };
  }

  get name(): string {
    return this.settings.settings.displayName;
  }
}
