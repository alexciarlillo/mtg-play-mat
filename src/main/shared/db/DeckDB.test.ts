// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import DeckDB from './DeckDB';
import { deckMigrations } from './deckSchema';
import { migrate, userVersion } from './migrate';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mtg-decks-'));
  dbPath = path.join(dir, 'Decks.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('deck schema migration', () => {
  it('moves one-row-per-copy decks into quantities on the main board', () => {
    const old = new DatabaseSync(dbPath);
    migrate(old, deckMigrations.slice(0, 1));
    old.exec(`
      INSERT INTO decks (id, name, display_card_id) VALUES
        (3, 'Elves', '${B}'), (7, 'Empty', NULL);
      INSERT INTO deck_cards (deck_id, card_id) VALUES
        (3, '${A}'), (3, '${A}'), (3, '${A}'), (3, '${B}'),
        (99, '${C}');
    `);
    old.close();

    const db = new DeckDB(dbPath);
    const decks = db.listDecks();
    expect(decks.map((d) => [d.id, d.name, d.format, d.cardCount])).toEqual(
      expect.arrayContaining([
        [3, 'Elves', 'constructed', 4],
        [7, 'Empty', 'constructed', 0],
      ])
    );
    expect(db.getDeck(3)?.displayPrintingId).toBe(B);
    expect(db.getDeckCards(3)).toEqual([
      { printingId: A, qty: 3, board: 'main' },
      { printingId: B, qty: 1, board: 'main' },
    ]);

    // Orphaned rows are dropped, and new decks don't reuse old ids.
    const raw = new DatabaseSync(dbPath);
    expect(userVersion(raw)).toBe(deckMigrations.length);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM deck_cards').get()?.n).toBe(
      2
    );
    raw.close();
    expect(db.createDeck({ name: 'New', format: 'other', cards: [] })).toBe(8);
  });

  it('creates the new schema on a fresh file', () => {
    const db = new DeckDB(dbPath);
    expect(db.listDecks()).toEqual([]);
  });
});

describe('DeckDB', () => {
  const make = () => {
    const db = new DeckDB(dbPath);
    const id = db.createDeck({
      name: 'Test',
      format: 'commander',
      cards: [
        { printingId: C, qty: 1, board: 'commander' },
        { printingId: A, qty: 2, board: 'main' },
        { printingId: A, qty: 1, board: 'main' },
        { printingId: B, qty: 2, board: 'side' },
      ],
    });
    return { db, id };
  };

  const cards = (db: DeckDB, id: number) =>
    db
      .getDeckCards(id)
      .map((c) => `${c.qty} ${c.printingId.at(-1)} ${c.board}`);

  it('merges duplicate lines and counts main + commander', () => {
    const { db, id } = make();
    expect(cards(db, id)).toEqual(['1 c commander', '3 a main', '2 b side']);
    expect(db.getDeck(id)).toMatchObject({
      name: 'Test',
      format: 'commander',
      displayPrintingId: C,
      cardCount: 4,
    });
  });

  it('sets quantities and removes cards at zero', () => {
    const { db, id } = make();
    db.editCards(id, { type: 'setQty', printingId: A, board: 'main', qty: 4 });
    db.editCards(id, { type: 'setQty', printingId: B, board: 'side', qty: 0 });
    expect(cards(db, id)).toEqual(['1 c commander', '4 a main']);
  });

  it('adds cards, merging into an existing row', () => {
    const { db, id } = make();
    db.editCards(id, { type: 'add', printingId: A, board: 'main', qty: 1 });
    db.editCards(id, { type: 'add', printingId: B, board: 'main', qty: 1 });
    expect(cards(db, id)).toEqual([
      '1 c commander',
      '4 a main',
      '2 b side',
      '1 b main',
    ]);
  });

  it('moves a card between boards, merging copies', () => {
    const { db, id } = make();
    db.editCards(id, { type: 'add', printingId: B, board: 'main', qty: 1 });
    db.editCards(id, { type: 'move', printingId: B, from: 'side', to: 'main' });
    expect(cards(db, id)).toEqual(['1 c commander', '3 a main', '3 b main']);
  });

  it('switches printings and carries the cover along', () => {
    const { db, id } = make();
    db.editCards(id, {
      type: 'setPrinting',
      printingId: C,
      board: 'commander',
      newPrintingId: B,
    });
    expect(cards(db, id)).toEqual(['3 a main', '2 b side', '1 b commander']);
    expect(db.getDeck(id)?.displayPrintingId).toBe(B);
  });

  it('updates name, format, and cover, and deletes decks with their cards', () => {
    const { db, id } = make();
    db.updateDeck(id, {
      name: 'Renamed',
      format: 'other',
      displayPrintingId: A,
    });
    expect(db.getDeck(id)).toMatchObject({
      name: 'Renamed',
      format: 'other',
      displayPrintingId: A,
    });
    db.deleteDeck(id);
    expect(db.getDeck(id)).toBeUndefined();
    expect(db.getDeckCards(id)).toEqual([]);
  });

  it('persists across reopening', () => {
    const { id } = make();
    expect(cards(new DeckDB(dbPath), id)).toHaveLength(3);
  });
});
