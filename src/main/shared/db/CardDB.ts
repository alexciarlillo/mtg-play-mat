import {
  CurrentSetListReturn,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from './CardDB.d';
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

  searchCardsByName = (
    options: SearchCardsByNameOptions
  ): SearchCardsByNameRet[] => {
    let condition = '1 ';
    console.log('options', options);
    const conditionStmts = [];
    if (options.keyword) {
      condition += `and c.name LIKE ? `;
      conditionStmts.push(`%${options.keyword}%`);
    }
    if (options.setCode) {
      condition += `and sets.code=? `;
      conditionStmts.push(options.setCode);
    }
    console.log(
      `SELECT c.id, c.name, c.uuid, c.scryfallId, c.originalText, sets.keyruneCode FROM cards as c left join sets on c.setCode = sets.code WHERE ${condition} limit 50`
    );

    const stmt = this.db.prepare(
      `SELECT c.id, c.name, c.uuid, c.scryfallId, c.originalText, sets.keyruneCode FROM cards as c left join sets on c.setCode = sets.code WHERE ${condition} limit 50`
    );

    return stmt.all(conditionStmts);
  };

  getCurrentSetList = (): CurrentSetListReturn[] => {
    const stmt = this.db.prepare(
      'select name, releaseDate, code, keyruneCode from sets where releaseDate < DATE() order by releaseDate desc'
    );

    return stmt.all();
  };
}
