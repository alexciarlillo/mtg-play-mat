// @vitest-environment node
import { createReadStream, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import type { CardDataProgress } from '@shared/types/cardData';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CardDB from '../shared/db/CardDB';
import { ingestBulkFile, parseCardLine } from './ingest';

const fixture = path.join(__dirname, 'fixtures/default-cards.sample.jsonl.gz');
const FIXTURE_CARDS = 39;

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtg-ingest-'));
  dbPath = path.join(dir, 'cards.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ingestFixture = (onProgress?: (p: CardDataProgress) => void) =>
  ingestBulkFile({
    source: createReadStream(fixture, { highWaterMark: 4096 }),
    totalBytes: 1234,
    dbPath,
    sourceUpdatedAt: '2026-09-18T09:05:32.127+00:00',
    onProgress,
    now: () => new Date('2026-09-18T12:00:00Z'),
  });

describe('ingestBulkFile', () => {
  it('builds printings, sets, and meta from a gzipped JSONL file', async () => {
    const progress: CardDataProgress[] = [];
    const { rows } = await ingestFixture((p) => progress.push(p));

    expect(rows).toBe(FIXTURE_CARDS);
    expect(progress.at(-1)).toMatchObject({ rows: FIXTURE_CARDS });
    expect(progress.at(-1)?.bytes).toBeGreaterThan(0);

    const db = new CardDB(dbPath);
    expect(db.available).toBe(true);
    expect(db.getMeta()).toEqual({
      sourceUpdatedAt: '2026-09-18T09:05:32.127+00:00',
      ingestedAt: '2026-09-18T12:00:00.000Z',
      printings: FIXTURE_CARDS,
    });

    const bears = db.getCardById({
      id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    });
    expect(bears).toMatchObject({
      name: 'Grizzly Bears',
      setCode: '10e',
      collectorNumber: '268',
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
      colors: ['G'],
      digital: false,
    });
    expect(bears?.faces).toHaveLength(1);
    expect(bears?.faces[0].image).toMatch(
      /^https:\/\/cards\.scryfall\.io\/normal\/front\/4\/0\//
    );
    db.close();
  });

  it('keeps both faces and images of a double-faced card', async () => {
    await ingestFixture();
    const db = new CardDB(dbPath);
    const delver = db.getCard({ name: 'Delver of Secrets', setCode: 'isd' });

    expect(delver?.name).toBe('Delver of Secrets // Insectile Aberration');
    expect(delver?.layout).toBe('transform');
    expect(delver?.faces.map((f) => f.name)).toEqual([
      'Delver of Secrets',
      'Insectile Aberration',
    ]);
    expect(delver?.faces[1]).toMatchObject({ power: '3', toughness: '2' });
    expect(delver?.faces[0].image).toMatch(/\/normal\/front\//);
    expect(delver?.faces[1].image).toMatch(/\/normal\/back\//);
    // Front-face stats are lifted onto the printing itself.
    expect(delver).toMatchObject({ power: '1', toughness: '1' });
    expect(db.getFaceImage(delver!.id, 1)).toBe(delver?.faces[1].image);
    db.close();
  });

  it('gives every face of a shared-image card the card image', async () => {
    await ingestFixture();
    const db = new CardDB(dbPath);
    const giant = db.getCard({ name: 'Bonecrusher Giant', setCode: 'eld' });

    expect(giant?.layout).toBe('adventure');
    expect(giant?.faces).toHaveLength(2);
    expect(giant?.faces[1].image).toBe(giant?.faces[0].image);
    db.close();
  });

  it('includes tokens and flags digital-only printings', async () => {
    await ingestFixture();
    const db = new CardDB(dbPath);

    expect(db.getCard({ name: 'Treasure', setCode: 'tsnc' })?.layout).toBe(
      'token'
    );
    const digital = db.searchCardsByName({ setCode: 'ymid' });
    expect(digital.length).toBeGreaterThan(0);
    expect(db.getCardById({ id: digital[0].id })?.digital).toBe(true);
    db.close();
  });

  it('derives sets, mapping token sets to their keyrune symbol', async () => {
    await ingestFixture();
    const db = new CardDB(dbPath);
    const sets = db.getCurrentSetList();

    expect(sets.find((s) => s.code === 'm21')).toMatchObject({
      name: 'Core Set 2021',
      keyruneCode: 'm21',
    });
    expect(sets.find((s) => s.code === 'tm21')).toMatchObject({
      setType: 'token',
      keyruneCode: 'm21',
    });
    db.close();
  });

  it('searches by name and set', async () => {
    await ingestFixture();
    const db = new CardDB(dbPath);

    const elves = db.searchCardsByName({ keyword: 'llanowar' });
    expect(elves.map((c) => c.setCode).sort()).toEqual(['dom', 'm19']);
    expect(
      db.searchCardsByName({ keyword: 'llanowar', setCode: 'DOM' })
    ).toEqual([
      expect.objectContaining({
        name: 'Llanowar Elves',
        setCode: 'dom',
        keyruneCode: 'dom',
      }),
    ]);
    // LIKE wildcards in the keyword are literal.
    expect(db.searchCardsByName({ keyword: '%' })).toEqual([]);
    db.close();
  });

  it('accepts an uncompressed JSON array body', async () => {
    const lines = gunzipSync(readFileSync(fixture))
      .toString()
      .trim()
      .split('\n');
    const body = `[\n${lines.join(',\n')}\n]\n`;

    const { rows } = await ingestBulkFile({
      source: [new TextEncoder().encode(body)],
      totalBytes: null,
      dbPath,
      sourceUpdatedAt: '2026-09-18T00:00:00Z',
    });
    expect(rows).toBe(FIXTURE_CARDS);
  });

  it('rejects an empty or malformed body', async () => {
    await expect(
      ingestBulkFile({
        source: [new TextEncoder().encode('[\n]\n')],
        totalBytes: null,
        dbPath,
        sourceUpdatedAt: 'x',
      })
    ).rejects.toThrow(/no cards/);
    await expect(
      ingestBulkFile({
        source: [new TextEncoder().encode('{"object": "card", oops\n')],
        totalBytes: null,
        dbPath,
        sourceUpdatedAt: 'x',
      })
    ).rejects.toThrow();
  });
});

describe('parseCardLine', () => {
  it('skips array brackets and non-card objects', () => {
    expect(parseCardLine('[')).toBeNull();
    expect(parseCardLine('  ')).toBeNull();
    expect(parseCardLine('{"object":"set"},')).toBeNull();
    expect(parseCardLine('{"object":"card","id":"x"},')).toMatchObject({
      id: 'x',
    });
  });
});
