import path from 'node:path';

import type { CardImageRef, ImageSize } from '@shared/cardImages';

const extension = (size: ImageSize) => (size === 'png' ? 'png' : 'jpg');

export const contentType = (size: ImageSize) =>
  size === 'png' ? 'image/png' : 'image/jpeg';

// Sharded like Scryfall's CDN so no directory grows past a few thousand
// files. Only ever called with a validated ref, so no traversal.
export const cachePath = (
  root: string,
  { id, face, size }: CardImageRef
): string =>
  path.join(root, size, id[0], id[1], `${id}-${face}.${extension(size)}`);

// Every size shares the "normal" URI's path (and cache-busting query), so
// the database only stores that one.
export const sizedImageUrl = (normalUrl: string, size: ImageSize): string => {
  const url = new URL(normalUrl);
  url.pathname = url.pathname.replace(/^\/normal\//, `/${size}/`);
  if (size === 'png') url.pathname = url.pathname.replace(/\.jpg$/, '.png');
  return url.href;
};

// Used when the card isn't in the database (e.g. the sample deck).
export const fallbackImageUrl = ({ id, face, size }: CardImageRef): string =>
  `https://cards.scryfall.io/${size}/${face === 0 ? 'front' : 'back'}/${
    id[0]
  }/${id[1]}/${id}.${extension(size)}`;
