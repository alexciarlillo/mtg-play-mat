// @vitest-environment node
import { createReadStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ingestBulkFile } from '../cardData/ingest';
import {
  printingColumns,
  type ScryfallCard,
  toPrintingRecord,
} from '../cardData/scryfallCard';
import CardDB from '../shared/db/CardDB';
import { cardMigrations } from '../shared/db/cardSchema';
import { migrate } from '../shared/db/migrate';
import { parseDeckList } from './parseDeckList';
import { resolveDeckList, toCardResults } from './resolveDeckList';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtg-resolve-'));
  dbPath = path.join(dir, 'cards.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

let serial = 0;
const uuid = () => {
  serial += 1;
  return `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
};

const card = (overrides: Partial<ScryfallCard>): ScryfallCard => ({
  object: 'card',
  id: uuid(),
  oracle_id: 'oracle-bolt',
  name: 'Lightning Bolt',
  lang: 'en',
  set: 'm10',
  set_name: 'Magic 2010',
  set_type: 'core',
  collector_number: '146',
  released_at: '2009-07-17',
  layout: 'normal',
  type_line: 'Instant',
  image_uris: { normal: 'https://cards.scryfall.io/normal/front/x.jpg' },
  ...overrides,
});

const seed = (cards: ScryfallCard[]) => {
  const db = new DatabaseSync(dbPath);
  migrate(db, cardMigrations);
  const insert = db.prepare(
    `INSERT INTO printings (${printingColumns.join(', ')})
     VALUES (${printingColumns.map(() => '?').join(', ')})`
  );
  cards.forEach((c) => {
    const record = toPrintingRecord(c);
    insert.run(...printingColumns.map((column) => record[column]));
  });
  db.close();
  return new CardDB(dbPath);
};

const resolve = (db: CardDB, text: string) =>
  resolveDeckList(parseDeckList(text), db.candidatesByName);

// Bolt printings chosen so each ranking rule has a loser to beat.
const bolts = () => {
  const printings = {
    m10: card({}),
    newest: card({
      set: 'clb',
      collector_number: '187',
      released_at: '2022-06-10',
    }),
    variant: card({
      set: 'clb',
      collector_number: '187s',
      released_at: '2022-06-10',
    }),
    digital: card({ set: 'ha1', digital: true, released_at: '2025-01-01' }),
    promo: card({
      set: 'pclb',
      promo: true,
      set_type: 'promo',
      released_at: '2024-01-01',
    }),
    german: card({ set: 'x24', lang: 'de', released_at: '2024-02-01' }),
    noImage: card({
      set: 'y24',
      image_uris: undefined,
      released_at: '2024-03-01',
    }),
    memorabilia: card({
      set: 'wc97',
      set_type: 'memorabilia',
      released_at: '2024-04-01',
    }),
    secretLair: card({
      set: 'sld',
      set_type: 'box',
      collector_number: '2080',
      released_at: '2025-04-28',
    }),
    listReprint: card({
      set: 'plst',
      set_type: 'masters',
      collector_number: 'CLB-187',
      released_at: '2025-05-12',
    }),
    preview: card({ set: 'nxt', released_at: '2999-01-01' }),
    star: card({
      set: 'sld',
      collector_number: '1011★',
      released_at: '2021-01-01',
    }),
  };
  return { printings, db: seed(Object.values(printings)) };
};

describe('resolveDeckList', () => {
  it('prefers exact set + number over everything else', () => {
    const { printings, db } = bolts();
    const report = resolve(db, '4 Lightning Bolt (M10) 146');
    expect(report.resolved[0]).toMatchObject({
      qty: 4,
      matchedBy: 'set+number',
      printing: { id: printings.m10.id },
    });
  });

  it('matches set codes and collector numbers loosely', () => {
    const { printings, db } = bolts();
    expect(
      resolve(db, '1 Lightning Bolt (sld) 1011*').resolved[0].printing.id
    ).toBe(printings.star.id);
    expect(
      resolve(db, '1 Lightning Bolt (M10) 0146').resolved[0]
    ).toMatchObject({
      matchedBy: 'set+number',
      printing: { id: printings.m10.id },
    });
  });

  it('falls back to name + set when the number is wrong', () => {
    const { printings, db } = bolts();
    const line = resolve(db, '1 Lightning Bolt (CLB) 999').resolved[0];
    expect(line.matchedBy).toBe('name+set');
    // Plain collector numbers beat variants like "187s".
    expect(line.printing.id).toBe(printings.newest.id);
    expect(line.warning).toMatch(/No #999 in CLB/);
  });

  it('falls back to the default printing when the set is unknown', () => {
    const { printings, db } = bolts();
    const line = resolve(db, '1 Lightning Bolt (ZZZ) 1').resolved[0];
    expect(line).toMatchObject({
      matchedBy: 'name',
      printing: { id: printings.newest.id },
    });
    expect(line.warning).toMatch(/Not printed in ZZZ/);
  });

  it('picks the newest English, paper, non-promo printing with an image', () => {
    const { printings, db } = bolts();
    expect(resolve(db, 'Lightning Bolt').resolved[0]).toMatchObject({
      matchedBy: 'name',
      printing: { id: printings.newest.id },
    });
  });

  it('still resolves when only a digital printing exists', () => {
    const db = seed([card({ name: 'Arena Only', digital: true })]);
    expect(resolve(db, '1 Arena Only').resolved).toHaveLength(1);
  });

  it('matches names ignoring case, accents, and punctuation', () => {
    const db = seed([
      card({ oracle_id: 'o1', name: 'Lim-Dûl’s Vault' }),
      card({ oracle_id: 'o2', name: 'Æther Vial' }),
    ]);
    const report = resolve(db, "1 lim-dul's vault\n1 AETHER VIAL");
    expect(report.unresolved).toEqual([]);
    expect(report.resolved.map((r) => r.printing.name)).toEqual([
      'Lim-Dûl’s Vault',
      'Æther Vial',
    ]);
  });

  it('matches // cards by full name or front face, but not art cards', () => {
    const delver = card({
      oracle_id: 'o-delver',
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
    });
    const art = card({
      oracle_id: 'o-art',
      name: 'Delver of Secrets // Delver of Secrets',
      layout: 'art_series',
      released_at: '2030-01-01',
    });
    const fire = card({
      oracle_id: 'o-fire',
      name: 'Fire // Ice',
      layout: 'split',
    });
    const db = seed([delver, art, fire]);

    const report = resolve(
      db,
      [
        '1 Delver of Secrets',
        '1 Delver of Secrets // Insectile Aberration',
        '1 Fire // Ice',
        '1 Fire/Ice',
        '1 Fire',
      ].join('\n')
    );
    expect(report.unresolved).toEqual([]);
    expect(report.resolved.map((r) => r.printing.id)).toEqual([
      delver.id,
      delver.id,
      fire.id,
      fire.id,
      fire.id,
    ]);
  });

  it('reports unknown cards with a reason instead of dropping them', () => {
    const { db } = bolts();
    const report = resolve(db, '2 Lightning Bolt\n3 Not A Card (M10) 1');
    expect(report.resolved).toHaveLength(1);
    expect(report.unresolved).toEqual([
      {
        line: 2,
        text: '3 Not A Card (M10) 1',
        qty: 3,
        board: 'main',
        name: 'Not A Card',
        reason: 'No card named "Not A Card"',
      },
    ]);
  });

  it('detects the commander format from a commander board', () => {
    const { db } = bolts();
    expect(resolve(db, 'Commander\n1 Lightning Bolt').format).toBe('commander');
    expect(resolve(db, '4 Lightning Bolt').format).toBe('constructed');
  });

  it('marks everything unresolved when there is no card data', () => {
    const report = resolveDeckList(parseDeckList('4 Lightning Bolt'), null);
    expect(report.cardDataMissing).toBe(true);
    expect(report.unresolved[0].reason).toBe('No card data yet');
  });

  it('groups name search results by card with a default printing', () => {
    const { printings, db } = bolts();
    const results = toCardResults(db.candidatesMatching('bolt'));
    expect(results).toHaveLength(1);
    expect(results[0].defaultPrinting.id).toBe(printings.newest.id);
    expect(db.printingsOf(printings.m10.id)).toHaveLength(12);
  });
});

describe('real-world exports against the ingest fixture', () => {
  const fixtureText = (name: string) =>
    readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

  const ingest = async () => {
    await ingestBulkFile({
      source: createReadStream(
        path.join(
          __dirname,
          '../cardData/fixtures/default-cards.sample.jsonl.gz'
        )
      ),
      totalBytes: null,
      dbPath,
      sourceUpdatedAt: '2026-09-18T00:00:00Z',
    });
    return new CardDB(dbPath);
  };

  it('resolves every line of a Moxfield Commander export', async () => {
    const db = await ingest();
    const report = resolve(db, fixtureText('moxfield-commander.txt'));
    expect(report.unresolved).toEqual([]);
    expect(report.format).toBe('commander');
    expect(
      report.resolved.every(
        (r) => r.matchedBy === 'set+number' || r.text === '1 Llanowar Elves'
      )
    ).toBe(true);
    const commander = report.resolved.find((r) => r.board === 'commander');
    expect(commander?.printing.name).toBe("Atraxa, Praetors' Voice");
    expect(report.ignored.map((i) => i.reason)).toEqual([
      'maybeboard',
      'maybeboard',
    ]);
    // Name-only picks the newer of the two fixture printings.
    const elves = report.resolved.find((r) => r.text === '1 Llanowar Elves');
    expect(elves?.printing.setCode).toBe('m19');
  });

  it('resolves an MTGA export with its sideboard', async () => {
    const db = await ingest();
    const report = resolve(db, fixtureText('mtga.txt'));
    expect(report.unresolved).toEqual([]);
    expect(report.deckName).toBe('Mono-White Angels');
    expect(report.format).toBe('constructed');
    expect(
      report.resolved.filter((r) => r.board === 'side').map((r) => r.qty)
    ).toEqual([2, 3]);
  });
});
