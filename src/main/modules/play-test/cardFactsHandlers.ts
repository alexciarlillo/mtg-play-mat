import { type CardFacts, factsFromPrinting } from '@shared/cardQuery';

import type { RequestHandlers } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import { sampleCardFacts } from './sampleDeck';

type CardFactsHandlers = Pick<RequestHandlers, 'getCardFacts'>;

// Far more distinct printings than any deck, so a library always fits.
const MAX_IDS = 1000;
const MAX_ID_LENGTH = 64;

const validIds = (ids: unknown): string[] =>
  Array.isArray(ids)
    ? [
        ...new Set(
          ids.filter(
            (id): id is string =>
              typeof id === 'string' && id !== '' && id.length <= MAX_ID_LENGTH
          )
        ),
      ].slice(0, MAX_IDS)
    : [];

// Unknown ids are left out of the result; the database wins over the
// sample deck's built-in facts when it has the printing.
const createCardFactsHandlers = ({
  cardDb,
}: {
  cardDb: CardDB;
}): CardFactsHandlers => ({
  getCardFacts: (ids: unknown) => {
    const wanted = validIds(ids);
    // A Map, then own properties, so an id like "__proto__" stays data.
    const found = new Map<string, CardFacts>();
    cardDb.printingsByIds(wanted).forEach((printing) => {
      found.set(printing.id, factsFromPrinting(printing));
    });
    wanted.forEach((id) => {
      const sample = found.has(id) ? undefined : sampleCardFacts(id);
      if (sample) found.set(id, sample);
    });
    return Object.fromEntries(found);
  },
});

export default createCardFactsHandlers;
