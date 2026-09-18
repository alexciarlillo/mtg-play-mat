import type { Migration } from './migrate';

// Card ids are Scryfall printing ids.
export const deckMigrations: Migration[] = [
  `
  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_card_id TEXT
  );
  CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id INTEGER NOT NULL,
    card_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS deck_cards_deck ON deck_cards (deck_id);
  `,
  // One row per printing and board with a quantity, instead of one row per
  // copy. Existing decks keep their ids and cards, all in the main board.
  `
  CREATE TABLE decks_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'constructed'
      CHECK (format IN ('commander', 'constructed', 'other')),
    display_printing_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
  );
  CREATE TABLE deck_cards_v2 (
    deck_id INTEGER NOT NULL REFERENCES decks_v2 (id) ON DELETE CASCADE,
    printing_id TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    board TEXT NOT NULL CHECK (board IN ('main', 'side', 'commander')),
    PRIMARY KEY (deck_id, printing_id, board)
  );

  INSERT INTO decks_v2 (id, name, display_printing_id)
    SELECT id, name, display_card_id FROM decks;
  INSERT INTO deck_cards_v2 (deck_id, printing_id, qty, board)
    SELECT deck_id, card_id, COUNT(*), 'main' FROM deck_cards
    WHERE deck_id IN (SELECT id FROM decks)
    GROUP BY deck_id, card_id;

  DROP TABLE deck_cards;
  DROP TABLE decks;
  ALTER TABLE decks_v2 RENAME TO decks;
  ALTER TABLE deck_cards_v2 RENAME TO deck_cards;
  `,
];
