// What a player is doing in their own library right now, so the table
// can see it: looking at the top N cards, or searching it. It says only
// that it is happening, never which cards are involved.
export type LibraryActivity =
  | { kind: 'look'; count: number }
  | { kind: 'search' }
  // Something a newer build does that this one has no words for.
  | { kind: 'other' };

export const MAX_LOOK_COUNT = 1000;

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Rebuilds an activity from untrusted input (a renderer or a peer).
// Unknown kinds become 'other' so a newer peer's view still parses.
export const parseLibraryActivity = (
  value: unknown,
  fail: (message: string) => never
): LibraryActivity | null => {
  if (value === null) return null;
  if (!isObject(value)) return fail('libraryActivity must be an object');
  const { kind, count } = value;
  if (typeof kind !== 'string' || kind.length === 0 || kind.length > 40) {
    return fail('libraryActivity.kind must be a short string');
  }
  if (kind === 'search') return { kind: 'search' };
  if (kind !== 'look') return { kind: 'other' };
  if (
    !Number.isInteger(count) ||
    (count as number) < 1 ||
    (count as number) > MAX_LOOK_COUNT
  ) {
    return fail(`libraryActivity.count must be in 1..${MAX_LOOK_COUNT}`);
  }
  return { kind: 'look', count: count as number };
};

export const sameLibraryActivity = (
  a: LibraryActivity | null,
  b: LibraryActivity | null
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.kind === b.kind &&
    (a.kind !== 'look' || (b.kind === 'look' && a.count === b.count)));

// A log line that follows the player's name.
export const describeLibraryActivity = (activity: LibraryActivity): string => {
  switch (activity.kind) {
    case 'look':
      return activity.count === 1
        ? 'is looking at the top card of their library'
        : `is looking at the top ${activity.count} cards of their library`;
    case 'search':
      return 'is searching their library';
    default:
      return 'is working in their library';
  }
};
