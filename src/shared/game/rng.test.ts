import { describe, expect, it } from 'vitest';

import { nextRandom, seedRng, shuffle } from './rng';

const sequence = (seed: number, length: number) => {
  const out: number[] = [];
  let state = seedRng(seed);
  for (let i = 0; i < length; i += 1) {
    const [value, next] = nextRandom(state);
    out.push(value);
    state = next;
  }
  return out;
};

describe('nextRandom', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(sequence(7, 20)).toEqual(sequence(7, 20));
    expect(sequence(7, 20)).not.toEqual(sequence(8, 20));
  });

  it('returns floats in [0, 1) and a uint32 state', () => {
    let state = seedRng(-1);
    expect(state).toBe(0xffffffff);
    for (let i = 0; i < 1000; i += 1) {
      const [value, next] = nextRandom(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isInteger(next) && next >= 0 && next < 2 ** 32).toBe(true);
      state = next;
    }
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 60 }, (_, i) => i);

  it('returns a permutation without mutating the input', () => {
    const input = Object.freeze([...items]);
    const [out] = shuffle(input, seedRng(1));
    expect(out).not.toEqual(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(input).toEqual(items);
  });

  it('is replayable: same seed, same order and next state', () => {
    expect(shuffle(items, seedRng(123))).toEqual(shuffle(items, seedRng(123)));
    expect(shuffle(items, seedRng(123))[0]).not.toEqual(
      shuffle(items, seedRng(124))[0]
    );
  });

  it('chains: consecutive shuffles continue from the returned state', () => {
    const [first, state] = shuffle(items, seedRng(5));
    const [second] = shuffle(first, state);
    const [again] = shuffle(shuffle(items, seedRng(5))[0], state);
    expect(second).toEqual(again);
    expect(second).not.toEqual(first);
  });

  it('handles empty and single-item lists', () => {
    expect(shuffle([], 9)).toEqual([[], 9]);
    expect(shuffle(['a'], 9)).toEqual([['a'], 9]);
  });

  it('spreads items roughly uniformly', () => {
    const counts = [0, 0, 0, 0];
    let state = seedRng(2024);
    const runs = 4000;
    for (let i = 0; i < runs; i += 1) {
      const [out, next] = shuffle([0, 1, 2, 3], state);
      counts[out[0]] += 1;
      state = next;
    }
    counts.forEach((count) => {
      expect(count / runs).toBeGreaterThan(0.22);
      expect(count / runs).toBeLessThan(0.28);
    });
  });
});
