// @vitest-environment node
import { createReadStream, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CardDataStatus } from '@shared/types/cardData';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CardDB from '../shared/db/CardDB';
import CardDataService, { type RunIngest } from './CardDataService';
import { ingestBulkFile } from './ingest';
import type { BulkDataInfo } from './scryfall';

const fixture = path.join(__dirname, 'fixtures/default-cards.sample.jsonl.gz');

// Stands in for the utility process: same pipeline, fixture bytes.
const fixtureIngest: RunIngest = async (request, onProgress) => {
  const { rows } = await ingestBulkFile({
    source: createReadStream(fixture),
    totalBytes: request.totalBytes,
    dbPath: request.dbPath,
    sourceUpdatedAt: request.sourceUpdatedAt,
    onProgress,
  });
  return rows;
};

const info = (updatedAt: string): BulkDataInfo => ({
  updatedAt,
  downloadUrl: 'https://data.test/cards.jsonl.gz',
  size: 1000,
});

describe('CardDataService', () => {
  let dir: string;
  let cardDb: CardDB;
  let statuses: CardDataStatus[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mtg-carddata-'));
    cardDb = new CardDB(path.join(dir, 'cards.sqlite'));
    statuses = [];
  });

  afterEach(() => {
    cardDb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (
    fetchInfo: () => Promise<BulkDataInfo>,
    runIngest: RunIngest = fixtureIngest
  ) =>
    new CardDataService({
      cardDb,
      appVersion: '0.0.0',
      bulkDataUrl: 'https://api.test/bulk',
      runIngest,
      fetchInfo,
      onStatus: (s) => statuses.push(s),
      now: () => new Date('2026-09-18T12:00:00Z'),
    });

  it('downloads on first run, reports progress, and swaps the file in', async () => {
    expect(cardDb.available).toBe(false);
    const cards = service(async () => info('2026-09-18T09:00:00Z'));
    await cards.check();

    expect(statuses.map((s) => s.phase)).toContain('updating');
    expect(statuses.some((s) => (s.progress?.rows ?? 0) > 0)).toBe(true);
    expect(cards.getStatus()).toMatchObject({
      phase: 'idle',
      error: null,
      local: { sourceUpdatedAt: '2026-09-18T09:00:00Z', printings: 39 },
    });
    expect(cardDb.available).toBe(true);
    expect(cardDb.searchCardsByName({ keyword: 'Delver' })).toHaveLength(1);
    expect(readdirSync(dir)).toEqual(['cards.sqlite']);
  });

  it('keeps fresh data without downloading', async () => {
    await service(async () => info('2026-09-17T00:00:00Z')).check();
    const runIngest = vi.fn(fixtureIngest);
    await service(async () => info('2026-09-18T09:00:00Z'), runIngest).check();
    expect(runIngest).not.toHaveBeenCalled();
  });

  it('keeps the old data and reports the error when offline', async () => {
    await service(async () => info('2026-09-01T00:00:00Z')).check();

    const offline = service(async () => {
      throw new TypeError('fetch failed');
    });
    await offline.check({ force: true });

    expect(offline.getStatus()).toMatchObject({
      phase: 'error',
      error: 'fetch failed',
      local: { sourceUpdatedAt: '2026-09-01T00:00:00Z' },
    });
    expect(
      cardDb.getCardById({ id: '409f9b88-f03e-40b6-9883-68c14c37c0de' })
    ).toBeDefined();
  });

  it('discards a failed build and keeps serving the old file', async () => {
    await service(async () => info('2026-09-01T00:00:00Z')).check();

    const broken = service(
      async () => info('2026-09-18T00:00:00Z'),
      async () => {
        throw new Error('connection reset');
      }
    );
    await broken.check({ force: true });

    expect(broken.getStatus().error).toBe('connection reset');
    expect(cardDb.getMeta()?.sourceUpdatedAt).toBe('2026-09-01T00:00:00Z');
    expect(readdirSync(dir)).toEqual(['cards.sqlite']);
  });

  it('runs one update at a time', async () => {
    const runIngest = vi.fn(fixtureIngest);
    const cards = service(async () => info('2026-09-18T09:00:00Z'), runIngest);
    await Promise.all([cards.check(), cards.check({ force: true })]);
    expect(runIngest).toHaveBeenCalledTimes(1);
  });
});
