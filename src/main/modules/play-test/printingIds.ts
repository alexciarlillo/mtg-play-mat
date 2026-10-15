// Far more distinct printings than any deck, so a whole one always fits.
const MAX_IDS = 1000;
const MAX_ID_LENGTH = 64;

// Printing ids from a renderer: distinct non-empty strings, capped.
export const validPrintingIds = (ids: unknown): string[] =>
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
