import type { CardRef, InstanceId, PlayerId, SearchPick } from './types';

// Search picks that end up hidden, so revealing them shows something.
// Picks onto the battlefield, graveyard or exile are public anyway.
export const isHiddenSearchPick = (pick: SearchPick) =>
  pick.to === 'hand' || pick.to === 'top' || pick.to === 'bottom';

// Where cards shown to one player came from. Only the counts and the
// source are public; the cards go to that player alone.
export const showingSources = [
  'hand',
  'card',
  'libraryTop',
  'search',
  'faceDown',
] as const;

// 'other' is a source a newer build has and this one has no words for.
export type ShowingSource = (typeof showingSources)[number] | 'other';

// In the revealer's public view while they show cards to one player.
export interface ShowingView {
  to: PlayerId;
  source: ShowingSource;
  count: number;
}

// What the renderer asks main to show one player. Main reads the cards
// from the game itself, so a window never has to hold them.
export type RevealRequest = { to: PlayerId } & (
  | { source: 'hand' }
  | { source: 'card'; instanceId: InstanceId }
  | { source: 'libraryTop'; count: number }
  // Picks still in the library, just before the search moves them.
  | { source: 'search'; instanceIds: InstanceId[] }
  | { source: 'faceDown'; instanceId: InstanceId }
);

// Cards shown to the local player by someone else, kept until dismissed.
export interface ShownToYou {
  // Unique on this machine, for dismissing and for keys.
  key: string;
  from: PlayerId;
  fromName: string;
  source: ShowingSource;
  cards: CardRef[];
  at: number;
  // The revealer stopped showing them; the player may still look.
  ended: boolean;
}

// A line only the local player sees, in the window that shows the hand.
export interface PrivateLogEntry {
  id: number;
  at: number;
  text: string;
  // Something the player should see now: a reveal that was refused.
  notice?: true;
}

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Unknown sources become 'other' so a newer peer's message still parses.
export const parseShowingSource = (
  value: unknown,
  fail: (message: string) => never
): ShowingSource => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) {
    return fail('source must be a short string');
  }
  return (showingSources as readonly string[]).includes(value)
    ? (value as ShowingSource)
    : 'other';
};

const cardCount = (n: number) => (n === 1 ? 'a card' : `${n} cards`);

// The words after "revealed", without any card names.
export const describeShowingSource = (
  source: ShowingSource,
  count: number
): string => {
  switch (source) {
    case 'hand':
      return `their hand (${cardCount(count)})`;
    case 'card':
      return `${cardCount(count)} from their hand`;
    case 'libraryTop':
      return count === 1
        ? 'the top card of their library'
        : `the top ${count} cards of their library`;
    case 'search':
      return `${cardCount(count)} they searched for`;
    case 'faceDown':
      return count === 1
        ? 'a face-down permanent'
        : `${count} face-down permanents`;
    default:
      return cardCount(count);
  }
};

// A public log line that follows the revealer's name. It never names a
// card, since everyone at the table reads it.
export const describeShowing = (
  source: ShowingSource,
  count: number,
  toName: string
): string => `revealed ${describeShowingSource(source, count)} to ${toName}`;

export const parseRevealRequest = (
  value: unknown,
  fail: (message: string) => never,
  maxCards: number
): RevealRequest => {
  if (!isObject(value)) return fail('reveal must be an object');
  const { to, source } = value;
  if (typeof to !== 'string' || to.length === 0 || to.length > 200) {
    return fail('reveal.to must be a player id');
  }
  const id = (key: string): string => {
    const v = value[key];
    return typeof v === 'string' && v.length > 0 && v.length <= 200
      ? v
      : fail(`reveal.${key} must be an id`);
  };
  switch (source) {
    case 'hand':
      return { to, source };
    case 'card':
    case 'faceDown':
      return { to, source, instanceId: id('instanceId') };
    case 'libraryTop': {
      const { count } = value;
      if (
        !Number.isInteger(count) ||
        (count as number) < 1 ||
        (count as number) > maxCards
      ) {
        return fail(`reveal.count must be in 1..${maxCards}`);
      }
      return { to, source, count: count as number };
    }
    case 'search': {
      const ids = value.instanceIds;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > maxCards ||
        !ids.every((v) => typeof v === 'string' && v.length <= 200)
      ) {
        return fail('reveal.instanceIds must be a list of ids');
      }
      return { to, source, instanceIds: ids as string[] };
    }
    default:
      return fail('reveal.source is unknown');
  }
};
