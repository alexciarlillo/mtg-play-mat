// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CardDB from './CardDB';
import { CARD_SCHEMA_VERSION, cardMigrations } from './cardSchema';
import { migrate, userVersion } from './migrate';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtg-carddb-'));
  dbPath = path.join(dir, 'cards.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('CardDB upgrade', () => {
  it('adds name keys and promo flags to a first-version file in place', () => {
    const old = new DatabaseSync(dbPath);
    migrate(old, cardMigrations.slice(0, 1));
    const insert = old.prepare(
      `INSERT INTO printings (id, oracle_id, name, lang, set_code, set_name,
         set_type, collector_number, layout, colors, color_identity,
         keywords, digital, faces)
       VALUES (?, 'o', ?, 'en', ?, 'Set', ?, '1', 'transform', '[]', '[]',
         '[]', 0, '[]')`
    );
    insert.run(
      'id-1',
      'Delver of Secrets // Insectile Aberration',
      'isd',
      'expansion'
    );
    insert.run(
      'id-2',
      'Delver of Secrets // Insectile Aberration',
      'pisd',
      'promo'
    );
    old.close();

    const db = new CardDB(dbPath);
    expect(db.available).toBe(true);
    const found = db.candidatesByName('delver of secrets');
    expect(found.map((c) => [c.id, c.promo])).toEqual([
      ['id-1', false],
      ['id-2', true],
    ]);
    db.close();

    const raw = new DatabaseSync(dbPath);
    expect(userVersion(raw)).toBe(CARD_SCHEMA_VERSION);
    raw.close();
  });
});

describe('CardDB upgrade to related tokens', () => {
  const insertPrinting = (db: DatabaseSync) =>
    db
      .prepare(
        `INSERT INTO printings (id, oracle_id, name, lang, set_code, set_name,
           set_type, collector_number, layout, colors, color_identity,
           keywords, digital, faces)
         VALUES ('id-1', 'o', 'Tireless Provisioner', 'en', 'mh2', 'Set',
           'expansion', '1', 'normal', '[]', '[]', '[]', 0, '[]')`
      )
      .run();

  it('works without related tokens and asks for a fresh download', () => {
    const old = new DatabaseSync(dbPath);
    migrate(old, cardMigrations.slice(0, 2));
    insertPrinting(old);
    const meta = old.prepare('INSERT INTO meta VALUES (?, ?)');
    meta.run('source_updated_at', '2026-09-18T09:00:00Z');
    meta.run('ingested_at', '2026-09-18T12:00:00Z');
    meta.run('printings', '1');
    old.close();

    const db = new CardDB(dbPath);
    expect(db.available).toBe(true);
    expect(db.getCardById({ id: 'id-1' })?.name).toBe('Tireless Provisioner');
    expect(db.relatedTokens(['id-1']).size).toBe(0);
    expect(db.getMeta()).toMatchObject({ printings: 1, needsRefresh: true });
    db.close();
  });

  it('flags nothing when the file is built from scratch', () => {
    const raw = new DatabaseSync(dbPath);
    migrate(raw, cardMigrations);
    const meta = raw.prepare('SELECT * FROM meta').all();
    raw.close();
    expect(meta).toEqual([]);
  });

  it('falls back to the newest printing of that name and type', () => {
    const raw = new DatabaseSync(dbPath);
    migrate(raw, cardMigrations);
    insertPrinting(raw);
    const insertToken = raw.prepare(
      `INSERT INTO printings (id, oracle_id, name, lang, set_code, set_name,
         set_type, collector_number, released_at, layout, type_line,
         colors, color_identity, keywords, digital, faces, name_key,
         front_key)
       VALUES (?, 'o-t', 'Treasure', 'en', ?, 'Tokens', 'token', '1', ?,
         'token', ?, '[]', '[]', '[]', 0, '[]', 'treasure', 'treasure')`
    );
    const artifact = 'Token Artifact — Treasure';
    insertToken.run('t-old', 'tm19', '2018-07-13', artifact);
    insertToken.run('t-new', 'tsnc', '2022-04-29', artifact);
    // Same name, other type: a different token, even though it's newer.
    insertToken.run('t-odd', 'tzzz', '2024-01-01', 'Token Creature — Treasure');
    raw
      .prepare(
        `INSERT INTO related_parts VALUES
           ('id-1', 'missing-id', 'token', 'Treasure', ?)`
      )
      .run(artifact);
    raw.close();

    const db = new CardDB(dbPath);
    expect(
      db
        .relatedTokens(['id-1'])
        .get('id-1')
        ?.map((p) => p.id)
    ).toEqual(['t-new']);
    db.close();
  });
});

describe('CardDB.searchTokens', () => {
  it('finds token printings by name, prefix matches first', () => {
    const raw = new DatabaseSync(dbPath);
    migrate(raw, cardMigrations);
    const insert = raw.prepare(
      `INSERT INTO printings (id, oracle_id, name, lang, set_code, set_name,
         set_type, collector_number, released_at, layout, type_line, colors,
         color_identity, keywords, digital, faces, name_key, front_key)
       VALUES (?1, 'o', ?2, 'en', ?3, 'Set', 'token', '1', ?4, ?5,
         'Token Creature', '[]', '[]', '[]', 0,
         json_array(json_object('name', ?2, 'typeLine', 'Token Creature')),
         lower(?2), lower(?2))`
    );
    insert.run('t-old', 'Soldier', 'tm19', '2018-07-13', 'token');
    insert.run('t-new', 'Soldier', 'tm21', '2020-07-03', 'token');
    insert.run('t-dfc', 'Human Soldier', 'tznr', '2020-09-25', 'token');
    insert.run('c-1', 'Soldier of Fortune', 'm21', '2020-07-03', 'normal');
    raw.close();

    const db = new CardDB(dbPath);
    expect(db.searchTokens('SOLD').map((p) => p.id)).toEqual([
      't-new',
      't-old',
      't-dfc',
    ]);
    expect(db.searchTokens('soldier')[0].faces[0].name).toBe('Soldier');
    expect(db.searchTokens('  ')).toEqual([]);
    expect(db.searchTokens('zombie')).toEqual([]);
    db.close();
  });
});

describe('CardDB.printingsByIds', () => {
  it('returns known printings and skips unknown ids', () => {
    const raw = new DatabaseSync(dbPath);
    migrate(raw, cardMigrations);
    raw
      .prepare(
        `INSERT INTO printings (id, oracle_id, name, lang, set_code, set_name,
           collector_number, layout, type_line, cmc, colors, color_identity,
           keywords, oracle_text, digital, faces)
         VALUES ('p-1', 'o', 'Shock', 'en', 'm19', 'Set', '1', 'normal',
           'Instant', 1, '["R"]', '["R"]', '[]', 'Shock deals 2 damage.', 0,
           json_array(json_object('name', 'Shock', 'typeLine', 'Instant')))`
      )
      .run();
    raw.close();

    const db = new CardDB(dbPath);
    const found = db.printingsByIds(['nope', 'p-1']);
    expect(found.map((p) => [p.id, p.cmc, p.colors])).toEqual([
      ['p-1', 1, ['R']],
    ]);
    expect(db.printingsByIds([])).toEqual([]);
    db.close();
  });
});
