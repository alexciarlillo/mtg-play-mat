// A lookup key that ignores case, accents, and punctuation, so "Lim-Dûl's
// Vault", "lim-dul's vault" and "Lim-Dul’s Vault" all match. Apostrophes are
// dropped rather than spaced so "Urza's" stays one word.
export const nameKey = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/['’‘`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Multi-face cards are often written by their front face alone.
export const frontFaceName = (name: string): string =>
  name.split(/\s*\/\/+\s*/)[0] ?? name;

export const frontKey = (name: string): string => nameKey(frontFaceName(name));
