import {
  CardRow,
  CurrentSetListReturn,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from '@shared/types/cards';

import DB from './DB';

const cardColumns =
  'name, uuid, scryfallId, setCode, number, power, toughness, type, types, keywords, life, loyalty';

interface GetCardOptions {
  name: string;
  setCode?: string;
  number?: string | null;
}

export default class CardDB extends DB {
  constructor() {
    super({ name: 'AllPrintings', readonly: true });
  }

  getCardById = ({ id }: { id: string }): CardRow | undefined => {
    if (!this.db) return undefined;

    const stmt = this.db.prepare<[string], CardRow>(
      `SELECT ${cardColumns} FROM cards WHERE uuid = ?`
    );

    return stmt.get(id);
  };

  getCard = ({
    name,
    setCode,
    number,
  }: GetCardOptions): CardRow | undefined => {
    if (!this.db) return undefined;

    let query = `SELECT ${cardColumns} FROM cards WHERE name = ? COLLATE NOCASE AND setCode = ? COLLATE NOCASE`;

    if (number) {
      query = `${query} AND number = ?`;
    }

    const stmt = this.db.prepare<string[], CardRow>(query);

    return stmt.get(
      ...[name, setCode, number].filter((v): v is string => Boolean(v))
    );
  };

  searchCardsByName = (
    options: SearchCardsByNameOptions
  ): SearchCardsByNameRet[] => {
    if (!this.db) return [];

    let condition = '1 ';
    const conditionStmts: string[] = [];
    if (options.keyword) {
      condition += `and c.name LIKE ? `;
      conditionStmts.push(`%${options.keyword}%`);
    }
    if (options.setCode) {
      condition += `and sets.code=? `;
      conditionStmts.push(options.setCode);
    }

    const stmt = this.db.prepare<string[], SearchCardsByNameRet>(
      `SELECT c.id, c.name, c.uuid, c.scryfallId, c.originalText, sets.keyruneCode FROM cards as c left join sets on c.setCode = sets.code WHERE ${condition} limit 50`
    );

    return stmt.all(...conditionStmts);
  };

  getCurrentSetList = (): CurrentSetListReturn[] => {
    if (!this.db) return [];

    const stmt = this.db.prepare<[], CurrentSetListReturn>(
      'select name, releaseDate, code, keyruneCode from sets where releaseDate < DATE() order by releaseDate desc'
    );

    return stmt.all();
  };
}
