import DB from './DB';

export default class CardDB extends DB {
  constructor() {
    super({ name: 'AllPrintings', readonly: true });
  }

  getCardById = ({ id }) => {
    const query =
      'SELECT name, uuid, scryfallId, setCode, number, power, toughness, type, types, keywords, life, loyalty FROM cards WHERE uuid = ?';

    const stmt = this.db.prepare(query);

    return stmt.get([id].filter(Boolean));
  };

  getCard = ({ name, setCode, number }) => {
    let query =
      'SELECT name, uuid, scryfallId, setCode, number, power, toughness, type, types, keywords, life, loyalty FROM cards WHERE name = ? COLLATE NOCASE AND setCode = ? COLLATE NOCASE';

    if (number) {
      query = `${query} AND number = ?`;
    }

    const stmt = this.db.prepare(query);

    return stmt.get([name, setCode, number].filter(Boolean));
  };

  searchCardsByName = ({ keyword }) => {
    const stmt = this.db.prepare(
      'SELECT name, uuid, scryfallId, originalText FROM cards WHERE name LIKE ?'
    );

    return stmt.all(`%${keyword}%`);
  };
}
