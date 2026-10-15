import { type CardFacts, factsFromPrinting } from '@shared/cardQuery';

import type { RequestHandlers } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import { validPrintingIds } from './printingIds';
import { sampleCardFacts } from './sampleDeck';

type CardFactsHandlers = Pick<RequestHandlers, 'getCardFacts'>;

// Unknown ids are left out of the result; the database wins over the
// sample deck's built-in facts when it has the printing.
const createCardFactsHandlers = ({
  cardDb,
}: {
  cardDb: CardDB;
}): CardFactsHandlers => ({
  getCardFacts: (ids: unknown) => {
    const wanted = validPrintingIds(ids);
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
