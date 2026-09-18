import path from 'node:path';

import { app } from 'electron';

export const getDbDir = () => path.join(app.getPath('userData'), 'db');

export const cardDbPath = () => path.join(getDbDir(), 'cards.sqlite');

export const deckDbPath = () => path.join(getDbDir(), 'Decks.sqlite');

export const imageCacheDir = () =>
  path.join(app.getPath('userData'), 'image-cache');
