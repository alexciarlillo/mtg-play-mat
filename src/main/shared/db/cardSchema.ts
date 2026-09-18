import type { Migration } from './migrate';

// The card database is rebuilt from Scryfall on every update, so a schema
// change only needs a new entry here; old files are simply re-downloaded.
export const cardMigrations: Migration[] = [
  `
  CREATE TABLE printings (
    id TEXT PRIMARY KEY,
    oracle_id TEXT,
    name TEXT NOT NULL,
    lang TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_name TEXT NOT NULL,
    set_type TEXT,
    collector_number TEXT NOT NULL,
    released_at TEXT,
    layout TEXT NOT NULL,
    type_line TEXT,
    mana_cost TEXT,
    cmc REAL,
    colors TEXT NOT NULL,
    color_identity TEXT NOT NULL,
    power TEXT,
    toughness TEXT,
    loyalty TEXT,
    defense TEXT,
    keywords TEXT NOT NULL,
    oracle_text TEXT,
    rarity TEXT,
    digital INTEGER NOT NULL,
    faces TEXT NOT NULL
  );
  CREATE INDEX printings_name ON printings (name COLLATE NOCASE);
  CREATE INDEX printings_set_number
    ON printings (set_code COLLATE NOCASE, collector_number);
  CREATE INDEX printings_oracle ON printings (oracle_id);

  CREATE TABLE sets (
    code TEXT PRIMARY KEY COLLATE NOCASE,
    name TEXT NOT NULL,
    set_type TEXT,
    released_at TEXT,
    keyrune_code TEXT NOT NULL,
    printing_count INTEGER NOT NULL,
    digital INTEGER NOT NULL
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export const CARD_SCHEMA_VERSION = cardMigrations.length;

export const metaKeys = {
  sourceUpdatedAt: 'source_updated_at',
  ingestedAt: 'ingested_at',
  printings: 'printings',
} as const;
