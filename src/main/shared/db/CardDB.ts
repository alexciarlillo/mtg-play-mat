import DB from './DB';

export interface SearchCardsByNameOptions {
  keyword: string;
}

export interface SearchCardsByNameRet {
  id: number;
  name: string;
  uuid: string;
  originalText: string;
  scryfallId: string;
  setCode: string;
}

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

  searchCardsByName = (
    options: SearchCardsByNameOptions
  ): SearchCardsByNameRet[] => {
    const stmt = this.db.prepare(
      'SELECT id, name, uuid, scryfallId, setCode, originalText FROM cards WHERE name LIKE ? limit 50'
    );

    return stmt.all(`%${options.keyword}%`);
  };
}
