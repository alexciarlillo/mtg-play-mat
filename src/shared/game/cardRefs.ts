import { isScryfallId } from '../cardImages';
import type { CardFace, CardRef } from './types';

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Layouts whose faces are alternate states of one permanent, so the
// permanent can be turned from one face to the next.
const turnableLayouts = new Set([
  'transform',
  'modal_dfc',
  'flip',
  'meld',
  'double_faced_token',
  'reversible_card',
]);

export const canTransform = (ref: CardRef): boolean =>
  ref.faces.length > 1 &&
  (ref.layout === undefined || turnableLayouts.has(ref.layout));

// Modal double-faced cards may be played as either face.
export const isModalDfc = (ref: CardRef): boolean =>
  ref.layout === 'modal_dfc' && ref.faces.length > 1;

export const currentFace = (
  ref: CardRef,
  faceIndex: number
): CardFace | undefined => ref.faces[faceIndex] ?? ref.faces[0];

// Stat lines are short ("*", "1+*", "10"); anything longer is junk.
const MAX_STAT = 20;
const MAX_TEXT = 200;
const MAX_FACES = 4;

// Rebuilds a card ref from untrusted input (a renderer or a peer) using
// known fields only. fail must throw; each caller has its own error type.
export const parseCardRef = (
  value: unknown,
  fail: (message: string) => never
): CardRef => {
  if (!isObject(value)) return fail('ref must be an object');

  const text = (fields: Fields, key: string, max: number, empty = false) => {
    const v = fields[key];
    if (typeof v !== 'string' || v.length > max || (!empty && v === '')) {
      return fail(`ref.${key} must be a string of at most ${max} chars`);
    }
    return v;
  };
  const optional = (fields: Fields, key: string, max: number) =>
    fields[key] === undefined ? {} : { [key]: text(fields, key, max, true) };
  const stats = (fields: Fields) => ({
    ...optional(fields, 'power', MAX_STAT),
    ...optional(fields, 'toughness', MAX_STAT),
    ...optional(fields, 'loyalty', MAX_STAT),
  });

  const custom = value.custom === true;
  const id = text(value, 'id', MAX_TEXT, custom);
  if (custom ? id !== '' : !isScryfallId(id)) {
    fail('ref.id must be a Scryfall id, or empty for a custom token');
  }

  const faces = value.faces;
  if (!Array.isArray(faces) || faces.length > MAX_FACES) {
    fail(`ref.faces must be an array of at most ${MAX_FACES}`);
  }

  return {
    id,
    name: text(value, 'name', MAX_TEXT),
    typeLine: text(value, 'typeLine', MAX_TEXT, true),
    faces: (faces as unknown[]).map((face): CardFace => {
      if (!isObject(face)) return fail('ref face must be an object');
      return {
        name: text(face, 'name', MAX_TEXT),
        typeLine: text(face, 'typeLine', MAX_TEXT, true),
        ...stats(face),
      };
    }),
    ...stats(value),
    ...optional(value, 'layout', 30),
    ...(custom && { custom: true as const }),
  };
};
