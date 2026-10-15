const KEY = 'play-test.recentQueries';
const MAX_RECENT = 5;

// Storage can be missing or full; recent queries are only a convenience.
export const recentQueries = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored)
      ? stored
          .filter((q): q is string => typeof q === 'string')
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
};

export const rememberQuery = (query: string) => {
  const text = query.trim();
  if (text === '') return;
  try {
    const next = [text, ...recentQueries().filter((q) => q !== text)];
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    // Nothing to do: the query just won't be offered next time.
  }
};
