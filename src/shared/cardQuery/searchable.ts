import type { CardRef } from '../game';
import type { CardFacts, Color } from './facts';

// Case, accents and curly quotes never decide a match.
export const fold = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export interface SearchFace {
  name: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

// A card flattened for matching. Fields that need card facts are null
// when the card has none (custom tokens, unknown printings).
export interface Searchable {
  name: string;
  layout: string;
  faces: SearchFace[];
  mv: number | null;
  colors: ReadonlySet<Color> | null;
  identity: ReadonlySet<Color> | null;
  keywords: string[] | null;
}

export const toSearchable = (ref: CardRef, facts?: CardFacts): Searchable => {
  const faces: SearchFace[] = facts
    ? facts.faces.map((face) => ({
        name: fold(face.name),
        typeLine: fold(face.typeLine),
        oracleText: fold(face.oracleText ?? ''),
        power: face.power,
        toughness: face.toughness,
        loyalty: face.loyalty,
      }))
    : ref.faces.map((face) => ({
        name: fold(face.name),
        typeLine: fold(face.typeLine),
        oracleText: '',
        power: face.power,
        toughness: face.toughness,
        loyalty: face.loyalty,
      }));
  // A ref without faces still has a name and type line to match on.
  if (faces.length === 0) {
    faces.push({
      name: fold(ref.name),
      typeLine: fold(ref.typeLine),
      oracleText: '',
      power: ref.power,
      toughness: ref.toughness,
      loyalty: ref.loyalty,
    });
  }
  return {
    name: fold(ref.name),
    layout: ref.layout ?? '',
    faces,
    mv: facts ? facts.mv : null,
    colors: facts ? new Set(facts.colors) : null,
    identity: facts ? new Set(facts.colorIdentity) : null,
    keywords: facts ? facts.keywords.map(fold) : null,
  };
};
