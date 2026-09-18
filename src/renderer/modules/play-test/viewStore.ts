import type { PlayerAction } from '@shared/game';
import { useSyncExternalStore } from 'react';

export interface ViewSource<V> {
  subscribe(listener: (view: V) => void): () => void;
  fetch(): Promise<V | null>;
}

export interface ViewStore<V> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): V | null;
}

// Holds the latest view main has sent. It subscribes before fetching, so a
// push that races the fetch is never lost, and seq drops whichever is older.
export const createViewStore = <V extends { seq: number }>(
  source: ViewSource<V>
): ViewStore<V> => {
  let current: V | null = null;
  const listeners = new Set<() => void>();

  const accept = (view: V | null) => {
    if (!view || (current && view.seq < current.seq)) return;
    current = view;
    listeners.forEach((listener) => listener());
  };

  source.subscribe(accept);
  source.fetch().then(accept, (err: unknown) => {
    console.error('[play-test] failed to load view', err);
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
  };
};

export const useView = <V>(store: ViewStore<V>): V | null =>
  useSyncExternalStore(store.subscribe, store.getSnapshot);

export const dispatch = (action: PlayerAction) => {
  window.api.dispatch(action).catch((err: unknown) => {
    console.error('[play-test] action failed', action, err);
  });
};
