// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  fetchBulkDataInfo,
  parseBulkDataInfo,
  scryfallHeaders,
  shouldDownload,
} from './scryfall';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-18T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * DAY).toISOString();

describe('shouldDownload', () => {
  it('downloads when there is no local data', () => {
    expect(
      shouldDownload({ local: null, remoteUpdatedAt: daysAgo(0), now })
    ).toBe(true);
  });

  it('waits until newer data is past the age limit', () => {
    const local = { sourceUpdatedAt: daysAgo(3) };
    expect(shouldDownload({ local, remoteUpdatedAt: daysAgo(0), now })).toBe(
      false
    );
    const old = { sourceUpdatedAt: daysAgo(8) };
    expect(
      shouldDownload({ local: old, remoteUpdatedAt: daysAgo(0), now })
    ).toBe(true);
  });

  it('never re-downloads data that is not newer', () => {
    const local = { sourceUpdatedAt: daysAgo(30) };
    expect(
      shouldDownload({ local, remoteUpdatedAt: daysAgo(30), now, force: true })
    ).toBe(false);
  });

  it('skips the age limit when forced', () => {
    const local = { sourceUpdatedAt: daysAgo(1) };
    expect(
      shouldDownload({ local, remoteUpdatedAt: daysAgo(0), now, force: true })
    ).toBe(true);
  });
});

describe('bulk-data info', () => {
  const body = {
    object: 'bulk_data',
    type: 'default_cards',
    updated_at: '2026-09-18T09:05:32.127+00:00',
    jsonl_download_uri: 'https://data.scryfall.io/default-cards/x.jsonl.gz',
    compressed_size: 78430813,
  };

  it('reads the JSONL download and its size', () => {
    expect(parseBulkDataInfo(body)).toEqual({
      updatedAt: '2026-09-18T09:05:32.127+00:00',
      downloadUrl: 'https://data.scryfall.io/default-cards/x.jsonl.gz',
      size: 78430813,
    });
  });

  it('rejects an unexpected response', () => {
    expect(() => parseBulkDataInfo({ object: 'error' })).toThrow();
  });

  it('identifies the app on every request', async () => {
    const fetchImpl = vi.fn(async () => Response.json(body));
    await fetchBulkDataInfo('https://api.test/bulk', '1.2.3', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://api.test/bulk', {
      headers: { 'User-Agent': 'MTGPlayMat/1.2.3', Accept: 'application/json' },
    });
    expect(scryfallHeaders('1.2.3')['User-Agent']).toBe('MTGPlayMat/1.2.3');
  });

  it('surfaces HTTP failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    await expect(
      fetchBulkDataInfo('https://api.test/bulk', '1', fetchImpl)
    ).rejects.toThrow(/503/);
  });
});
