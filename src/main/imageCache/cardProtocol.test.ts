// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCardImageHandler } from './cardProtocol';
import { cachePath, fallbackImageUrl, sizedImageUrl } from './imagePaths';

const id = '3279314f-d639-4489-b2ab-3621bb3ca64b';
const normal = `https://cards.scryfall.io/normal/front/3/2/${id}.jpg?1592710000`;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('image paths', () => {
  it('shards the cache by size and id prefix', () => {
    expect(cachePath('/cache', { id, face: 1, size: 'png' })).toBe(
      path.join('/cache', 'png', '3', '2', `${id}-1.png`)
    );
  });

  it('derives other sizes from the stored normal uri', () => {
    expect(sizedImageUrl(normal, 'large')).toBe(
      `https://cards.scryfall.io/large/front/3/2/${id}.jpg?1592710000`
    );
    expect(sizedImageUrl(normal, 'png')).toBe(
      `https://cards.scryfall.io/png/front/3/2/${id}.png?1592710000`
    );
  });

  it('builds a CDN url for cards missing from the database', () => {
    expect(fallbackImageUrl({ id, face: 1, size: 'normal' })).toBe(
      `https://cards.scryfall.io/normal/back/3/2/${id}.jpg`
    );
  });
});

describe('createCardImageHandler', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(path.join(tmpdir(), 'mtg-images-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  const setup = (lookup?: string) => {
    const fetch = vi.fn(async () => new Response(jpeg));
    const handler = createCardImageHandler({
      cacheDir,
      lookupImage: () => lookup,
      fetch,
    });
    return { fetch, handler };
  };

  const get = (handler: (r: Request) => Promise<Response>, url: string) =>
    handler(new Request(url));

  it('fetches the database uri on a miss and caches it', async () => {
    const { fetch, handler } = setup(normal);
    const response = await get(handler, `card://${id}/0/large`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect(fetch).toHaveBeenCalledWith(sizedImageUrl(normal, 'large'));
    expect(
      existsSync(cachePath(cacheDir, { id, face: 0, size: 'large' }))
    ).toBe(true);
  });

  it('serves a cached image without the network', async () => {
    const online = setup(normal);
    await get(online.handler, `card://${id}/0/normal`);

    const offline = createCardImageHandler({
      cacheDir,
      lookupImage: () => normal,
      fetch: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    const response = await get(offline, `card://${id}/0/normal`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
  });

  it('shares one download between concurrent requests', async () => {
    const { fetch, handler } = setup(normal);
    await Promise.all([
      get(handler, `card://${id}/0/normal`),
      get(handler, `card://${id}/0/normal`),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the CDN path for unknown cards', async () => {
    const { fetch, handler } = setup(undefined);
    await get(handler, `card://${id}/1/normal`);
    expect(fetch).toHaveBeenCalledWith(
      fallbackImageUrl({ id, face: 1, size: 'normal' })
    );
  });

  it('reports failures without caching them', async () => {
    const handler = createCardImageHandler({
      cacheDir,
      lookupImage: () => normal,
      fetch: vi.fn(async () => new Response('', { status: 404 })),
    });
    expect((await get(handler, `card://${id}/0/normal`)).status).toBe(502);
    expect((await get(handler, 'card://nope/0/normal')).status).toBe(400);
    expect(
      existsSync(cachePath(cacheDir, { id, face: 0, size: 'normal' }))
    ).toBe(false);
  });
});
