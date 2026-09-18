// Mulberry32: a tiny PRNG whose whole state is one uint32, so it can live
// in GameState and make shuffles replayable from the log.

export const seedRng = (seed: number): number => seed >>> 0;

// Returns a float in [0, 1) and the next state.
export const nextRandom = (state: number): [number, number] => {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
};

// Fisher-Yates. Returns a new array and the advanced PRNG state.
export const shuffle = <T>(
  items: readonly T[],
  state: number
): [T[], number] => {
  const out = [...items];
  let rng = state;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const [value, next] = nextRandom(rng);
    rng = next;
    const j = Math.floor(value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, rng];
};
