import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DeckRow } from '@shared/types/cards';

import { getErrorMessage } from '../../util';
import { deckMigrations } from './deckSchema';
import { migrate, transaction } from './migrate';

interface AddDeckOptions {
  name: string;
  displayCardId: string;
  cardIds: string[];
}

export default class DeckDB {
  // Null when the file can't be opened; callers treat that as no decks.
  private db: DatabaseSync | null = null;

  constructor(readonly filePath: string) {
    try {
      mkdirSync(path.dirname(filePath), { recursive: true });
      const db = new DatabaseSync(filePath);
      migrate(db, deckMigrations);
      this.db = db;
    } catch (err) {
      console.warn('[DeckDB] failed to open', {
        message: getErrorMessage(err),
        filePath,
      });
    }
  }

  getDecks = (): DeckRow[] => {
    if (!this.db) return [];

    return this.db
      .prepare('SELECT name, id, display_card_id FROM decks')
      .all() as unknown as DeckRow[];
  };

  getDeckCards = ({ deckId }: { deckId: number | string }) => {
    if (!this.db) return [];

    return this.db
      .prepare('SELECT card_id FROM deck_cards WHERE deck_id = ?')
      .all(deckId) as { card_id: string }[];
  };

  addDeck = ({ name, displayCardId, cardIds }: AddDeckOptions) => {
    const { db } = this;
    if (!db) {
      console.warn('[DeckDB] no deck database; import skipped');
      return;
    }

    transaction(db, () => {
      const info = db
        .prepare('INSERT INTO decks (name, display_card_id) VALUES (?, ?)')
        .run(name, displayCardId);
      const insertCard = db.prepare(
        'INSERT INTO deck_cards (deck_id, card_id) VALUES (?, ?)'
      );
      cardIds.forEach((cardId) => {
        insertCard.run(info.lastInsertRowid, cardId);
      });
    });
  };

  deleteDeck = ({ id }: { id: number }) => {
    const { db } = this;
    if (!db) return;

    transaction(db, () => {
      db.prepare('DELETE FROM deck_cards WHERE deck_id = ?').run(id);
      db.prepare('DELETE FROM decks WHERE id = ?').run(id);
    });
  };
}
