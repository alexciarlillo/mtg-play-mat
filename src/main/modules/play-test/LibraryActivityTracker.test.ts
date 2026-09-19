// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import LibraryActivityTracker from './LibraryActivityTracker';

const setup = () => {
  const changed = vi.fn();
  const lines: string[] = [];
  const tracker: LibraryActivityTracker = new LibraryActivityTracker({
    changed,
    log: (text) => {
      lines.push(text);
      tracker.lineLogged(text);
    },
  });
  return { tracker, changed, lines };
};

describe('LibraryActivityTracker', () => {
  it('sets and clears the activity, announcing only the start', () => {
    const { tracker, changed, lines } = setup();
    tracker.set({ kind: 'search' });
    expect(tracker.current).toEqual({ kind: 'search' });
    expect(lines).toEqual(['is searching their library']);

    tracker.clear();
    expect(tracker.current).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(lines).toHaveLength(1);
  });

  it('says how many cards are being looked at', () => {
    const { tracker, lines } = setup();
    tracker.set({ kind: 'look', count: 3 });
    tracker.set({ kind: 'look', count: 1 });
    expect(lines).toEqual([
      'is looking at the top 3 cards of their library',
      'is looking at the top card of their library',
    ]);
  });

  it('ignores repeats of the current activity', () => {
    const { tracker, changed, lines } = setup();
    tracker.set({ kind: 'look', count: 2 });
    tracker.set({ kind: 'look', count: 2 });
    tracker.clear();
    tracker.clear();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(lines).toHaveLength(1);
  });

  it("doesn't announce a reopened dialog until something else is logged", () => {
    const { tracker, changed, lines } = setup();
    tracker.set({ kind: 'search' });
    tracker.clear();
    tracker.set({ kind: 'search' });
    expect(lines).toEqual(['is searching their library']);
    expect(changed).toHaveBeenCalledTimes(3);

    tracker.lineLogged('searched their library, then shuffled');
    tracker.clear();
    tracker.set({ kind: 'search' });
    expect(lines).toHaveLength(2);
  });

  it('resets quietly for callers that push views themselves', () => {
    const { tracker, changed } = setup();
    tracker.set({ kind: 'search' });
    tracker.reset();
    expect(tracker.current).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
