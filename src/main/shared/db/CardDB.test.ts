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
