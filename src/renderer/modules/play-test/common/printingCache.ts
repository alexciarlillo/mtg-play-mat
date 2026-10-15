import { useEffect, useSyncExternalStore } from 'react';

export interface PrintingCache<T> {
  // Undefined until (or unless) the printing has a value.
  get(id: string): T | undefined;
  // Whether a lookup has an answer yet, even "unknown" or a failed request,
  // so a caller waiting on it never waits forever. Custom tokens have no
  // printing, so there is nothing to wait for.
  settled(id: string): boolean;
  load(ids: Iterable<string>): void;
  // Fetches values for the given printings and re-renders as they arrive.
  useLookup(ids: readonly string[]): (id: string) => T | undefined;
}

// Public card data never changes for a printing, so one cache serves the
// whole window. null marks an id the card database has nothing for.
export const createPrintingCache = <T>(
  label: string,
  request: (ids: string[]) => Promise<Record<string, T>>
): PrintingCache<T> => {
  const cache = new Map<string, T | null>();
  const pending = new Set<string>();
  // Ids whose last request failed: nothing for now, but asked again on
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

  const get = (id: string): T | undefined => cache.get(id) ?? undefined;

  const load = (ids: Iterable<string>) => {
    const missing = [...new Set(ids)].filter(
      (id) => id !== '' && !cache.has(id) && !pending.has(id)
    );
    if (missing.length === 0) return;
    missing.forEach((id) => pending.add(id));
    request(missing).then(
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
        console.error(`[play-test] failed to load ${label}`, err);
      }
    );
  };

  const useLookup = (ids: readonly string[]) => {
    useSyncExternalStore(subscribe, getVersion);
    const key = [...new Set(ids)].sort().join('\n');
    useEffect(() => {
      if (key !== '') load(key.split('\n'));
    }, [key]);
    return get;
  };

  return {
    get,
    settled: (id) => id === '' || cache.has(id) || failed.has(id),
    load,
    useLookup,
  };
};
