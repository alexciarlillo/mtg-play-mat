import { type CardView, counterNames, currentFace } from '@shared/game';

// A face-down permanent (morph, manifest, disguise) is a 2/2 creature.
const FACE_DOWN_STATS = { power: '2', toughness: '2' };

const withDelta = (base: string, delta: number): string => {
  const n = Number(base);
  if (base.trim() !== '' && Number.isFinite(n)) return String(n + delta);
  if (delta === 0) return base;
  return delta > 0 ? `${base}+${delta}` : `${base}${delta}`;
};

const faceOf = (card: CardView) =>
  card.ref ? currentFace(card.ref, card.faceIndex) : undefined;

const typeLineOf = (card: CardView): string =>
  faceOf(card)?.typeLine ?? card.ref?.typeLine ?? '';

// Power/toughness to show on a badge: shown for face-down permanents, for
// a set base (which replaces the printed one), and whenever +1/+1 or -1/-1
// counters change the printed values.
export const powerToughness = (card: CardView): string | null => {
  const delta =
    (card.counters[counterNames.plusOne] ?? 0) -
    (card.counters[counterNames.minusOne] ?? 0);

  if (card.ptOverride) {
    const { power, toughness } = card.ptOverride;
    return `${power + delta}/${toughness + delta}`;
  }
  if (card.faceDown) {
    const { power, toughness } = FACE_DOWN_STATS;
    return `${withDelta(power, delta)}/${withDelta(toughness, delta)}`;
  }
  if (delta === 0 || !card.ref) return null;

  const face = faceOf(card);
  const power = face?.power ?? card.ref.power;
  const toughness = face?.toughness ?? card.ref.toughness;
  if (power === undefined || toughness === undefined) return null;
  return `${withDelta(power, delta)}/${withDelta(toughness, delta)}`;
};

// The base a P/T dialog starts from: the set one, else the printed one.
export const basePowerToughness = (
  card: CardView
): { power: number; toughness: number } => {
  if (card.ptOverride) return { ...card.ptOverride };
  if (card.faceDown) return { power: 2, toughness: 2 };
  const face = faceOf(card);
  const read = (value?: string) => {
    const n = Number.parseInt(value ?? '', 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    power: read(face?.power ?? card.ref?.power),
    toughness: read(face?.toughness ?? card.ref?.toughness),
  };
};

export const isPlaneswalker = (card: CardView): boolean =>
  !card.faceDown && /Planeswalker/.test(typeLineOf(card));

// Loyalty is tracked as loyalty counters, placed when the card enters.
export const loyalty = (card: CardView): number | null =>
  isPlaneswalker(card) ? (card.counters[counterNames.loyalty] ?? 0) : null;

// Counters with no badge of their own, as shown on the card's chips.
export const otherCounters = (card: CardView): [string, number][] =>
  Object.entries(card.counters).filter(
    ([name]) => name !== counterNames.loyalty || !isPlaneswalker(card)
  );
