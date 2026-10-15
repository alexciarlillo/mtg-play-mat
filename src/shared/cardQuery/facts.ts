import type { Printing } from '../types/cards';

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

export type Color = (typeof COLORS)[number];

export interface CardFactsFace {
  name: string;
  typeLine: string;
  manaCost?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

// Rules text and colours for one printing. Kept out of CardRef so game
// state, views and the wire stay small; looked up by printing id instead.
export interface CardFacts {
  mv: number;
  colors: Color[];
  colorIdentity: Color[];
  keywords: string[];
  faces: CardFactsFace[];
}

const isColor = (value: string): value is Color =>
  (COLORS as readonly string[]).includes(value);

export const toColors = (values: Iterable<string>): Color[] => {
  const set = new Set([...values].map((v) => v.toUpperCase()));
  return COLORS.filter((color) => set.has(color));
};

const manaColors = (manaCost: string): Color[] =>
  toColors(
    [...manaCost.matchAll(/\{([^}]+)\}/g)].flatMap((m) =>
      (m[1] ?? '').split('/').filter(isColor)
    )
  );

const optional = <K extends string>(key: K, value: string | null | undefined) =>
  (value != null && value !== '' ? { [key]: value } : {}) as Partial<
    Record<K, string>
  >;

// Scryfall leaves top-level colours off double-faced cards, so those fall
// back to their faces' mana costs. Single-faced cards keep [] (devoid).
export const factsFromPrinting = (printing: Printing): CardFacts => {
  const faces = printing.faces.map((face): CardFactsFace => ({
    name: face.name,
    typeLine: face.typeLine,
    ...optional('manaCost', face.manaCost),
    ...optional('oracleText', face.oracleText),
    ...optional('power', face.power),
    ...optional('toughness', face.toughness),
    ...optional('loyalty', face.loyalty),
  }));
  const colors =
    printing.colors.length > 0 || faces.length < 2
      ? toColors(printing.colors)
      : toColors(faces.flatMap((face) => manaColors(face.manaCost ?? '')));
  return {
    mv: printing.cmc ?? 0,
    colors,
    colorIdentity: toColors(printing.colorIdentity),
    keywords: [...printing.keywords],
    faces,
  };
};
