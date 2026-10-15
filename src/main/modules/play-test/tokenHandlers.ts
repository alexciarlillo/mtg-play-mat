import type { Printing, TokenSearchResult } from '@shared/types/cards';

import type { RequestHandlers } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import { toCardRef } from './cardRef';
import { validPrintingIds } from './printingIds';

type TokenHandlers = Pick<RequestHandlers, 'searchTokens' | 'relatedTokens'>;

const MAX_QUERY = 100;

const toResult = (printing: Printing): TokenSearchResult => ({
  ref: toCardRef(printing),
  setCode: printing.setCode,
  setName: printing.setName,
  ...(printing.oracleId && { oracleId: printing.oracleId }),
});

const createTokenHandlers = ({
  cardDb,
}: {
  cardDb: CardDB;
}): TokenHandlers => ({
  searchTokens: (query: unknown) =>
    typeof query === 'string' && query.length <= MAX_QUERY
      ? cardDb.searchTokens(query).map(toResult)
      : [],
  // Own properties from a Map, so an id like "__proto__" stays data.
  relatedTokens: (ids: unknown) =>
    Object.fromEntries(
      [...cardDb.relatedTokens(validPrintingIds(ids))].map(
        ([id, printings]) => [id, printings.map(toResult)]
      )
    ),
});

export default createTokenHandlers;
