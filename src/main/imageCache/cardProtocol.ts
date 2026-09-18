import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CARD_SCHEME,
  type CardImageRef,
  parseCardImageUrl,
} from '@shared/cardImages';

import { getErrorMessage } from '../util';
import {
  cachePath,
  contentType,
  fallbackImageUrl,
  sizedImageUrl,
} from './imagePaths';

// Must run before app 'ready'. "standard" gives card:// URLs a host (the
// Scryfall id) and "secure" lets pages under a strict CSP load them.
export const cardSchemePrivileges = {
  scheme: CARD_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
};

export interface CardImageHandlerDeps {
  cacheDir: string;
  // The "normal" image URI for a face, from the card database.
  lookupImage(id: string, face: number): string | undefined;
  fetch(url: string): Promise<Response>;
}

const exists = (file: string) =>
  stat(file).then(
    (s) => s.isFile(),
    () => false
  );

// Serves card images from the disk cache, fetching from Scryfall only on
// a miss, so an image seen once keeps working offline.
export const createCardImageHandler = ({
  cacheDir,
  lookupImage,
  fetch,
}: CardImageHandlerDeps) => {
  const inFlight = new Map<string, Promise<void>>();

  const download = async (ref: CardImageRef, file: string) => {
    const normal = lookupImage(ref.id, ref.face);
    const upstream = normal
      ? sizedImageUrl(normal, ref.size)
      : fallbackImageUrl(ref);
    const response = await fetch(upstream);
    if (!response.ok) {
      throw new Error(`image fetch failed (${response.status}) ${upstream}`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(file), { recursive: true });
    // Write then rename, so a crash never leaves a truncated image behind.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
  };

  const ensureCached = (ref: CardImageRef, file: string) => {
    let pending = inFlight.get(file);
    if (!pending) {
      pending = download(ref, file).finally(() => inFlight.delete(file));
      inFlight.set(file, pending);
    }
    return pending;
  };

  return async (request: Request): Promise<Response> => {
    const ref = parseCardImageUrl(request.url);
    if (!ref) return new Response('bad card image url', { status: 400 });

    const file = cachePath(cacheDir, ref);
    try {
      if (!(await exists(file))) await ensureCached(ref, file);
    } catch (err) {
      console.warn('[card://]', getErrorMessage(err));
      return new Response('card image unavailable', { status: 502 });
    }

    return new Response(await readFile(file), {
      headers: {
        'Content-Type': contentType(ref.size),
        'Cache-Control': 'max-age=31536000, immutable',
      },
    });
  };
};
