import type { Settings } from '@shared/settings';

import type { RelaySettings } from './RelayTransport';

// Every copy of the app presents this id, so the relay can rate-limit
// and revoke one app without touching another.
export const RELAY_APP_ID = 'mtg-play-mat';

// A key shipped inside a desktop app is not a secret: it keeps drive-by
// scanners off a public endpoint, nothing more. Settings override it, so
// you can point the app at your own relay with your own key.
const BUILT_IN_APP_KEY = '';

const env = (name: string): string | null => {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : null;
};

export const relaySettings = (settings: Settings): RelaySettings => ({
  baseUrl: env('MTG_PLAY_MAT_RELAY_URL') ?? settings.relayUrl,
  appId: env('MTG_PLAY_MAT_RELAY_APP_ID') ?? RELAY_APP_ID,
  appKey:
    env('MTG_PLAY_MAT_RELAY_APP_KEY') ?? settings.relayKey ?? BUILT_IN_APP_KEY,
});
