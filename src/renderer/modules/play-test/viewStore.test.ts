import { describe, expect, it, vi } from 'vitest';

import { createViewStore, type ViewSource } from './viewStore';

interface View {
  seq: number;
  label: string;
}

const fakeSource = () => {
  let push: (view: View) => void = () => {};
  let resolveFetch: (view: View | null) => void = () => {};
  const source: ViewSource<View> = {
    subscribe: (listener) => {
      push = listener;
      return () => {};
    },
    fetch: () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
  };
  return {
    source,
    push: (view: View) => push(view),
    resolveFetch: (view: View | null) => resolveFetch(view),
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createViewStore', () => {
  it('starts empty, then takes the fetched view', async () => {
    const fake = fakeSource();
    const store = createViewStore(fake.source);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getSnapshot()).toBeNull();
    fake.resolveFetch({ seq: 3, label: 'fetched' });
    await flush();

    expect(store.getSnapshot()?.label).toBe('fetched');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer push over a slower, older fetch', async () => {
    const fake = fakeSource();
    const store = createViewStore(fake.source);

    fake.push({ seq: 5, label: 'pushed' });
    fake.resolveFetch({ seq: 4, label: 'stale' });
    await flush();

    expect(store.getSnapshot()?.label).toBe('pushed');
  });

  it('ignores a null fetch and follows later pushes', async () => {
    const fake = fakeSource();
    const store = createViewStore(fake.source);

    fake.resolveFetch(null);
    await flush();
    expect(store.getSnapshot()).toBeNull();

    fake.push({ seq: 1, label: 'a' });
    fake.push({ seq: 2, label: 'b' });
    expect(store.getSnapshot()?.label).toBe('b');
  });

  it('stops notifying after unsubscribe', () => {
    const fake = fakeSource();
    const store = createViewStore(fake.source);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    fake.push({ seq: 1, label: 'a' });
    expect(listener).not.toHaveBeenCalled();
  });
});
