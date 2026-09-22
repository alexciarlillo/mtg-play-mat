import { describe, expect, it } from 'vitest';

import { SlidingCounter, TokenBucket } from './limits';

describe('TokenBucket', () => {
  it('spends the burst, then refuses', () => {
    const bucket = new TokenBucket(10, 100, 0);
    expect(bucket.take(100, 0)).toBe(true);
    expect(bucket.take(1, 0)).toBe(false);
  });

  it('refills over time, up to the burst', () => {
    const bucket = new TokenBucket(10, 100, 0);
    expect(bucket.take(100, 0)).toBe(true);
    expect(bucket.take(50, 5_000)).toBe(true);
    expect(bucket.take(60, 5_000)).toBe(false);
    expect(bucket.take(100, 1_000_000)).toBe(true);
    expect(bucket.take(1, 1_000_000)).toBe(false);
  });

  it('is not fooled by a clock going backwards', () => {
    const bucket = new TokenBucket(10, 100, 1_000);
    expect(bucket.take(100, 0)).toBe(true);
    expect(bucket.take(1, 0)).toBe(false);
  });
});

describe('SlidingCounter', () => {
  it('allows up to the limit inside the window', () => {
    const counter = new SlidingCounter(2, 1_000);
    expect(counter.allow('a', 0)).toBe(true);
    expect(counter.allow('a', 100)).toBe(true);
    expect(counter.allow('a', 200)).toBe(false);
    // A different key has its own budget.
    expect(counter.allow('b', 200)).toBe(true);
  });

  it('forgets hits that fell out of the window', () => {
    const counter = new SlidingCounter(1, 1_000);
    expect(counter.allow('a', 0)).toBe(true);
    expect(counter.allow('a', 999)).toBe(false);
    expect(counter.allow('a', 1_001)).toBe(true);
  });

  it('drops keys with nothing left on a sweep', () => {
    const counter = new SlidingCounter(1, 1_000);
    counter.allow('a', 0);
    counter.sweep(5_000);
    expect(counter.allow('a', 5_000)).toBe(true);
  });
});
