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
