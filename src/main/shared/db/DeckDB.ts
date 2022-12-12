import DB from './DB';

export default class CardDB extends DB {
  constructor() {
    super({ name: 'Decks', readonly: false });
  }

  getDecks = () => {
    const query = 'SELECT name, id, display_card_id FROM decks';
    const stmt = this.db.prepare(query);
    return stmt.all();
  };

  getDeckCards = ({ deckId }) => {
    const stmt = this.db.prepare(
      'SELECT card_id FROM deck_cards WHERE deck_id = ?'
    );

    return stmt.all(deckId);
  };

  addDeck = ({ name, displayCardId, cardIds }) => {
    const insertDeck = this.db.prepare(
      'INSERT INTO decks (name, display_card_id) VALUES (?, ?)'
    );

    const info = insertDeck.run(name, displayCardId);

    const getDeck = this.db.prepare('SELECT id from decks WHERE rowid = ?');
    const { id: deckId } = getDeck.get(info.lastInsertRowid);

    const cardStmt = this.db.prepare(
      'INSERT INTO deck_cards (deck_id, card_id) VALUES (?, ?)'
    );

    const insertMany = this.db.transaction((_cardIds) => {
      _cardIds.forEach((cardId) => {
        cardStmt.run(deckId, cardId);
      });
    });

    insertMany(cardIds);
  };
}
