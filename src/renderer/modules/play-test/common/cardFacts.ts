import type { CardFacts } from '@shared/cardQuery';

import { createPrintingCache } from './printingCache';

const facts = createPrintingCache<CardFacts>('card facts', (ids) =>
  window.api.getCardFacts(ids)
);

export const cardFacts = facts.get;

export const factsSettled = facts.settled;

export const loadCardFacts = facts.load;

// Returns a lookup that is undefined until (or unless) facts are known.
export const useCardFacts = (
  ids: readonly string[]
): ((id: string) => CardFacts | undefined) => facts.useLookup(ids);
