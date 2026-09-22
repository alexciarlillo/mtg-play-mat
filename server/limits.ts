// A leaky bucket over bytes received, so one connection cannot turn the
// relay into a free file transfer service.
export class TokenBucket {
  private tokens: number;

  private updated: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    now = Date.now()
  ) {
    this.tokens = burst;
    this.updated = now;
  }

  // False once the bucket is dry; the caller drops the connection.
  take(bytes: number, now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.updated) / 1000;
    this.updated = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
    if (this.tokens < bytes) return false;
    this.tokens -= bytes;
    return true;
  }
}

// How many times one address did something in the last window.
export class SlidingCounter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length >= this.limit) {
      this.hits.set(key, kept);
      return false;
    }
    kept.push(now);
    this.hits.set(key, kept);
    return true;
  }

  sweep(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    this.hits.forEach((times, key) => {
      const kept = times.filter((at) => at > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    });
  }
}
