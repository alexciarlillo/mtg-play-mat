import { type TypeGroup, typeGroup, typeGroups } from '../decks/cardTypes';
import type { CardView } from '../game';
import { type CardFacts, type Color, COLORS } from './facts';

export const BROWSER_SORTS = ['name', 'mv', 'type', 'color', 'newest'] as const;
export const BROWSER_GROUPS = ['none', 'type', 'mv', 'color'] as const;

export type BrowserSort = (typeof BROWSER_SORTS)[number];
export type BrowserGroup = (typeof BROWSER_GROUPS)[number];

export type FactsLookup = (id: string) => CardFacts | undefined;

export interface OrganizeOptions {
  sort: BrowserSort;
  group: BrowserGroup;
  stack: boolean;
  // The library's order is secret: 'newest' is refused and ties break on
  // instance id, so nothing shown depends on where a card sits.
  hideOrder: boolean;
}

// Identical cards shown as one tile; cards[0] stands for the stack.
export interface CardStack {
  key: string;
  cards: CardView[];
}

export interface CardGroup {
  key: string;
  label: string;
  count: number;
  stacks: CardStack[];
}

export interface Count {
  key: string;
  label: string;
  count: number;
}

const MAX_MV_BUCKET = 7;

const factsOf = (card: CardView, facts: FactsLookup) =>
  card.ref && card.ref.id !== '' ? facts(card.ref.id) : undefined;

const nameOf = (card: CardView) => card.ref?.name ?? '';

export const cardTypeGroup = (card: CardView): TypeGroup =>
  typeGroup(card.ref?.typeLine);

// MV buckets 0-6, then "7+"; null when the card has no facts.
const mvBucket = (card: CardView, facts: FactsLookup): number | null => {
  const mv = factsOf(card, facts)?.mv;
  return mv === undefined ? null : Math.min(Math.floor(mv), MAX_MV_BUCKET);
};

type ColorKey = Color | 'M' | 'C' | '?';

const COLOR_KEYS: ColorKey[] = [...COLORS, 'M', 'C', '?'];

const COLOR_LABELS: Record<ColorKey, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  M: 'Multicolour',
  C: 'Colourless',
  '?': 'Unknown',
};

const colorKey = (card: CardView, facts: FactsLookup): ColorKey => {
  const colors = factsOf(card, facts)?.colors;
  if (colors === undefined) return '?';
  if (colors.length === 0) return 'C';
  return colors.length === 1 ? colors[0]! : 'M';
};

const compareBy = <T>(order: readonly T[]) => {
  const rank = (value: T) => order.indexOf(value);
  return (a: T, b: T) => rank(a) - rank(b);
};

const byType = compareBy(typeGroups);
const byColor = compareBy(COLOR_KEYS);

// Unknown MVs sort after every known one.
const mvRank = (card: CardView, facts: FactsLookup) =>
  factsOf(card, facts)?.mv ?? Number.POSITIVE_INFINITY;

const primary = (
  sort: BrowserSort,
  facts: FactsLookup
): ((a: CardView, b: CardView) => number) => {
  switch (sort) {
    case 'mv':
      return (a, b) => mvRank(a, facts) - mvRank(b, facts);
    case 'type':
      return (a, b) => byType(cardTypeGroup(a), cardTypeGroup(b));
    case 'color':
      return (a, b) => byColor(colorKey(a, facts), colorKey(b, facts));
    default:
      return () => 0;
  }
};

// Same printing in the same state looks the same, so it can share a tile.
const stackKey = (card: CardView): string =>
  JSON.stringify([
    card.ref?.id ?? null,
    card.ref?.name ?? null,
    card.faceIndex,
    card.faceDown,
    card.isToken,
    card.isCommander ?? false,
    Object.entries(card.counters).sort(),
  ]);

interface Grouping {
  key: (card: CardView) => string;
  label: (key: string) => string;
  compare: (a: string, b: string) => number;
}

const groupings: Record<
  Exclude<BrowserGroup, 'none'>,
  (f: FactsLookup) => Grouping
> = {
  type: () => ({
    key: cardTypeGroup,
    label: (key) => key,
    compare: (a, b) => byType(a as TypeGroup, b as TypeGroup),
  }),
  mv: (facts) => ({
    key: (card) => String(mvBucket(card, facts) ?? '?'),
    label: (key) => {
      if (key === '?') return 'Unknown';
      return key === String(MAX_MV_BUCKET) ? `MV ${key}+` : `MV ${key}`;
    },
    compare: (a, b) =>
      (a === '?' ? Infinity : Number(a)) - (b === '?' ? Infinity : Number(b)),
  }),
  color: (facts) => ({
    key: (card) => colorKey(card, facts),
    label: (key) => COLOR_LABELS[key as ColorKey],
    compare: (a, b) => byColor(a as ColorKey, b as ColorKey),
  }),
};

const stackUp = (cards: CardView[], stack: boolean): CardStack[] => {
  if (!stack) {
    return cards.map((card) => ({ key: card.instanceId, cards: [card] }));
  }
  const stacks = new Map<string, CardStack>();
  cards.forEach((card) => {
    const key = stackKey(card);
    const existing = stacks.get(key);
    if (existing) existing.cards.push(card);
    else stacks.set(key, { key: card.instanceId, cards: [card] });
  });
  return [...stacks.values()];
};

// Cards come in zone order (the end of the array is the newest card).
export const sortCards = (
  cards: readonly CardView[],
  facts: FactsLookup,
  { sort, hideOrder }: Pick<OrganizeOptions, 'sort' | 'hideOrder'>
): CardView[] => {
  const effective = hideOrder && sort === 'newest' ? 'name' : sort;
  const position = new Map(cards.map((card, i) => [card.instanceId, i]));
  const first = primary(effective, facts);
  const tieBreak = (a: CardView, b: CardView) => {
    if (hideOrder) return a.instanceId < b.instanceId ? -1 : 1;
    return position.get(b.instanceId)! - position.get(a.instanceId)!;
  };
  return [...cards].sort((a, b) => {
    if (effective === 'newest') return tieBreak(a, b);
    return first(a, b) || nameOf(a).localeCompare(nameOf(b)) || tieBreak(a, b);
  });
};

// Sorts, then groups, then stacks identical cards within each group.
export const organize = (
  cards: readonly CardView[],
  facts: FactsLookup,
  options: OrganizeOptions
): CardGroup[] => {
  const sorted = sortCards(cards, facts, options);
  if (options.group === 'none') {
    return [
      {
        key: 'all',
        label: 'All',
        count: sorted.length,
        stacks: stackUp(sorted, options.stack),
      },
    ];
  }
  const grouping = groupings[options.group](facts);
  const buckets = new Map<string, CardView[]>();
  sorted.forEach((card) => {
    const key = grouping.key(card);
    buckets.set(key, [...(buckets.get(key) ?? []), card]);
  });
  return [...buckets.entries()]
    .sort(([a], [b]) => grouping.compare(a, b))
    .map(([key, members]) => ({
      key,
      label: grouping.label(key),
      count: members.length,
      stacks: stackUp(members, options.stack),
    }));
};

// How many cards fall in each type or MV bucket, in display order.
export const countBy = (
  cards: readonly CardView[],
  facts: FactsLookup,
  by: 'type' | 'mv'
): Count[] =>
  organize(cards, facts, {
    sort: 'name',
    group: by,
    stack: false,
    hideOrder: true,
  }).map(({ key, label, count }) => ({ key, label, count }));
