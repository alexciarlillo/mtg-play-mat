import path from 'node:path';

import { app } from 'electron';

export const getDbDir = () => path.join(app.getPath('userData'), 'db');

export const cardDbPath = () => path.join(getDbDir(), 'cards.sqlite');

export const deckDbPath = () => path.join(getDbDir(), 'Decks.sqlite');

export const imageCacheDir = () =>
  path.join(app.getPath('userData'), 'image-cache');

export const placeholderImageCacheDir = () =>
  path.join(app.getPath('userData'), 'image-cache-test');

export const matsDir = () => path.join(app.getPath('userData'), 'mats');

// Saved games hold the hidden library order, so they stay in the
// profile's own folder like everything else here.
export const savesDir = () => path.join(app.getPath('userData'), 'saves');
