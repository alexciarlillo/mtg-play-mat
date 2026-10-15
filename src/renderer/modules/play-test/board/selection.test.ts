import type { CardView } from '@shared/game';
import { describe, expect, it, vi } from 'vitest';

import { SelectionStore } from './selection';

const cardOf = (instanceId: string): CardView => ({
  instanceId,
  ref: null,
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
});

describe('SelectionStore', () => {
  it('toggles, sets and clears, telling listeners only on change', () => {
    const store = new SelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.toggle('a');
    store.toggle('b');
    expect([...store.ids]).toEqual(['a', 'b']);
    store.toggle('a');
    expect([...store.ids]).toEqual(['b']);
    expect(listener).toHaveBeenCalledTimes(3);
    store.set(['b']);
    expect(listener).toHaveBeenCalledTimes(3);
    store.clear();
    expect(store.ids.size).toBe(0);
  });

  it('drops cards no longer on the battlefield', () => {
    const store = new SelectionStore();
    const [a, b, c] = ['a', 'b', 'c'].map(cardOf);
    store.sync([a, b, c]);
    store.set(['a', 'b', 'c']);
    store.sync([a, c]);
    expect([...store.ids]).toEqual(['a', 'c']);
    // A new game starts with nothing on the battlefield.
    store.sync([]);
    expect(store.ids.size).toBe(0);
  });

  it('groups only a card that is selected with others', () => {
    const store = new SelectionStore();
    const [a, b, c] = ['a', 'b', 'c'].map(cardOf);
    store.sync([a, b, c]);
    store.set(['c', 'a']);
    expect(store.groupOf(a)).toEqual([a, c]);
    expect(store.groupOf(b)).toBeNull();
    store.set(['a']);
    expect(store.groupOf(a)).toBeNull();
  });

  it('shifts the followers of a group drag until their view changes', () => {
    const store = new SelectionStore();
    const [a, b] = ['a', 'b'].map(cardOf);
    store.sync([a, b]);
    store.set(['a', 'b']);
    store.startDrag('a');
    // No shift yet, so nothing is lifted.
    expect(store.offsetOf(b)).toBeNull();
    store.moveDrag({ dx: 5, dy: 6 });
    expect(store.offsetOf(a)).toBeNull();
    expect(store.offsetOf(b)).toEqual({ dx: 5, dy: 6 });
    expect(store.offsetOf(b)).toBe(store.offsetOf(b));
    // Mid-drag a newer view of the same card still follows.
    expect(store.offsetOf({ ...b })).toEqual({ dx: 5, dy: 6 });

    store.dropDrag({ dx: 7, dy: 8 });
    expect(store.offsetOf(b)).toEqual({ dx: 7, dy: 8 });
    // Once dropped, main's next view takes over.
    expect(store.offsetOf({ ...b })).toBeNull();
    store.endDrag();
    expect(store.offsetOf(b)).toBeNull();
  });
});
