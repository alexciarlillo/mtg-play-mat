import type { CardFacts } from '@shared/cardQuery';
import { useEffect, useSyncExternalStore } from 'react';

// Facts never change for a printing, so one cache serves the whole
// window. null marks an id the card database doesn't know.
const cache = new Map<string, CardFacts | null>();
const pending = new Set<string>();
// Ids whose last request failed: no facts for now, but asked again on
// the next load.
const failed = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getVersion = () => version;

export const cardFacts = (id: string): CardFacts | undefined =>
  cache.get(id) ?? undefined;

// Whether a lookup has an answer yet, even "unknown" or a failed request,
// so a caller waiting on it never waits forever. Custom tokens have no
// printing, so there is nothing to wait for.
export const factsSettled = (id: string): boolean =>
  id === '' || cache.has(id) || failed.has(id);

export const loadCardFacts = (ids: Iterable<string>) => {
  const missing = [...new Set(ids)].filter(
    (id) => id !== '' && !cache.has(id) && !pending.has(id)
  );
  if (missing.length === 0) return;
  missing.forEach((id) => pending.add(id));
  window.api.getCardFacts(missing).then(
    (found) => {
      missing.forEach((id) => {
        pending.delete(id);
        failed.delete(id);
        cache.set(id, Object.hasOwn(found, id) ? found[id]! : null);
      });
      notify();
    },
    (err: unknown) => {
      // Left uncached, so the next load of these ids asks again.
      missing.forEach((id) => {
        pending.delete(id);
        failed.add(id);
      });
      notify();
      console.error('[play-test] failed to load card facts', err);
    }
  );
};

// Fetches facts for the given printings and re-renders as they arrive.
// Returns a lookup that is undefined until (or unless) facts are known.
export const useCardFacts = (
  ids: readonly string[]
): ((id: string) => CardFacts | undefined) => {
  useSyncExternalStore(subscribe, getVersion);
  const key = [...new Set(ids)].sort().join('\n');
  useEffect(() => {
    if (key !== '') loadCardFacts(key.split('\n'));
  }, [key]);
  return cardFacts;
};
