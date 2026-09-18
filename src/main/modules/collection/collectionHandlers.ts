import type CardDB from '../../shared/db/CardDB';
import type { RequestHandlers } from '../../ipc';

type CollectionHandlers = Pick<RequestHandlers, 'searchCards' | 'listSets'>;

const createCollectionHandlers = ({
  cardDb,
}: {
  cardDb: CardDB;
}): CollectionHandlers => ({
  searchCards: (options) => cardDb.searchCardsByName(options),
  listSets: () => cardDb.getCurrentSetList(),
});

export default createCollectionHandlers;
