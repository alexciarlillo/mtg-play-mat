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
];
