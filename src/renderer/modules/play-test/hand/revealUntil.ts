import {
  matchesQuery,
  parseQuery,
  type QueryError,
  type QueryNode,
  toSearchable,
} from '@shared/cardQuery';
import type { CardFacts } from '@shared/cardQuery';
import {
  type ArrangeTopAction,
  type CardView,
  MAX_REVEALED_CARDS,
  type PlayerId,
} from '@shared/game';

export type StopFilter = 'none' | 'land' | 'nonland' | 'creature' | 'query';

export const stopFilters: { id: StopFilter; label: string }[] = [
  { id: 'none', label: 'No stop: I decide' },
  { id: 'land', label: 'A land' },
  { id: 'nonland', label: 'A nonland card' },
  { id: 'creature', label: 'A creature card' },
  { id: 'query', label: 'A card matching…' },
];

// The presets are queries too, so every stop matches the same way.
const presetQueries: Record<'land' | 'nonland' | 'creature', string> = {
  land: 't:land',
  nonland: '-t:land',
  creature: 't:creature',
};

export interface Stop {
  node: QueryNode | null;
  errors: QueryError[];
}

// A null node means there is nothing to stop on.
export const parseStop = (stop: StopFilter, query: string): Stop => {
  if (stop === 'none') return { node: null, errors: [] };
  return parseQuery(stop === 'query' ? query : presetQueries[stop]);
};

export const matcher =
  (node: QueryNode | null, facts: (id: string) => CardFacts | undefined) =>
  (card: CardView): boolean =>
    node !== null &&
    card.ref !== null &&
    matchesQuery(node, toSearchable(card.ref, facts(card.ref.id)));

// Index of the first match at or after from, or -1.
export const firstMatch = (
  cards: readonly CardView[],
  matches: (card: CardView) => boolean,
  from = 0
): number => {
  for (let i = from; i < cards.length; i += 1) {
    if (matches(cards[i]!)) return i;
  }
  return -1;
};

// How many cards a reveal may show at most, given the library's size.
export const revealCap = (librarySize: number) =>
  Math.min(librarySize, MAX_REVEALED_CARDS);

// How many cards to show to reach the next hit, or the cap without one.
export const revealUntilTarget = (
  library: readonly CardView[],
  matches: (card: CardView) => boolean,
  shown: number
): number => {
  const cap = revealCap(library.length);
  const at = firstMatch(library.slice(0, cap), matches, shown);
  return at >= 0 ? at + 1 : cap;
};

export type HitDestination = 'hand' | 'battlefield' | 'exile';
export type RestDestination = 'bottom' | 'graveyard';

export const hitDestinations: {
  id: HitDestination;
  label: string;
  key: string;
}[] = [
  { id: 'hand', label: 'Hand', key: 'h' },
  { id: 'battlefield', label: 'Battlefield', key: 'b' },
  { id: 'exile', label: 'Exile', key: 'e' },
];

export const restDestinations: {
  id: RestDestination;
  label: string;
  key: string;
}[] = [
  { id: 'bottom', label: 'Bottom in a random order', key: 'r' },
  { id: 'graveyard', label: 'Graveyard', key: 'g' },
];

// Puts every revealed card away in one action: the hit where it goes,
// the rest to the bottom at random or into the graveyard.
export const finishAction = (
  playerId: PlayerId,
  shown: readonly string[],
  hit: string | null,
  hitTo: HitDestination,
  restTo: RestDestination
): ArrangeTopAction => {
  const rest = shown.filter((id) => id !== hit);
  const hits = hit !== null && shown.includes(hit) ? [hit] : [];
  return {
    type: 'arrangeTop',
    playerId,
    top: [],
    bottom: restTo === 'bottom' ? rest : [],
    graveyard: restTo === 'graveyard' ? rest : [],
    exile: hitTo === 'exile' ? hits : [],
    hand: hitTo === 'hand' ? hits : [],
    ...(hitTo === 'battlefield' && hits.length > 0 && { battlefield: hits }),
    ...(restTo === 'bottom' && rest.length > 1 && { bottomRandom: true }),
  };
};
