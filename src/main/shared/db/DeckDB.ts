import { DeckRow } from '@shared/types/cards';

import DB from './DB';

interface AddDeckOptions {
  name: string;
  displayCardId: string;
  cardIds: string[];
}

export default class DeckDB extends DB {
  constructor() {
    super({ name: 'Decks', readonly: false });
  }

  getDecks = (): DeckRow[] => {
    if (!this.db) return [];

    const query = 'SELECT name, id, display_card_id FROM decks';

    const stmt = this.db.prepare<[], DeckRow>(query);
    return stmt.all();
  };

  getDeckCards = ({ deckId }: { deckId: number | string }) => {
    if (!this.db) return [];

    const stmt = this.db.prepare<[number | string], { card_id: string }>(
      'SELECT card_id FROM deck_cards WHERE deck_id = ?'
    );

    return stmt.all(deckId);
  };

  addDeck = ({ name, displayCardId, cardIds }: AddDeckOptions) => {
    const { db } = this;
    if (!db) {
      console.warn('[DeckDB] no deck database; import skipped');
      return;
    }

    const insertDeck = db.prepare(
      'INSERT INTO decks (name, display_card_id) VALUES (?, ?)'
    );

    const info = insertDeck.run(name, displayCardId);

    const getDeck = db.prepare<[number | bigint], { id: number }>(
      'SELECT id from decks WHERE rowid = ?'
    );
    const deck = getDeck.get(info.lastInsertRowid);
    if (!deck) return;

    const cardStmt = db.prepare(
      'INSERT INTO deck_cards (deck_id, card_id) VALUES (?, ?)'
    );

    const insertMany = db.transaction((_cardIds: string[]) => {
      _cardIds.forEach((cardId) => {
        cardStmt.run(deck.id, cardId);
      });
    });

    insertMany(cardIds);
  };

  deleteDeck = ({ id }: { id: number }) => {
    if (!this.db) return;

    const cardStmt = this.db.prepare(
      'DELETE FROM deck_cards WHERE deck_id = ?'
    );
    const deckStmt = this.db.prepare('DELETE FROM decks where id = ?');

    cardStmt.run(id);
    deckStmt.run(id);
  };
}
