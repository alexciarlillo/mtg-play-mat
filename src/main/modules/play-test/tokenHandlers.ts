import type { RequestHandlers } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import { toCardRef } from './cardRef';

type TokenHandlers = Pick<RequestHandlers, 'searchTokens'>;

const MAX_QUERY = 100;

const createTokenHandlers = ({
  cardDb,
}: {
  cardDb: CardDB;
}): TokenHandlers => ({
  searchTokens: (query: unknown) =>
    typeof query === 'string' && query.length <= MAX_QUERY
      ? cardDb.searchTokens(query).map((printing) => ({
          ref: toCardRef(printing),
          setCode: printing.setCode,
          setName: printing.setName,
        }))
      : [],
});

export default createTokenHandlers;
