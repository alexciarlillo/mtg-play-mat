import { frontKey, nameKey } from '@shared/cardNames';
import type { PrintingFace } from '@shared/types/cards';

// The subset of a Scryfall card object that we store.
interface ScryfallFace {
  name?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  image_uris?: { normal?: string };
}

export interface ScryfallCard extends ScryfallFace {
  object: string;
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  set_type?: string;
  collector_number: string;
  released_at?: string;
  layout: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  rarity?: string;
  digital?: boolean;
  promo?: boolean;
  card_faces?: ScryfallFace[];
}

// Column values for one printings row, in insert order.
export interface PrintingRecord {
  id: string;
  oracle_id: string | null;
  name: string;
  lang: string;
  set_code: string;
  set_name: string;
  set_type: string | null;
  collector_number: string;
  released_at: string | null;
  layout: string;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string;
  color_identity: string;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  keywords: string;
  oracle_text: string | null;
  rarity: string | null;
  digital: number;
  faces: string;
  name_key: string;
  front_key: string;
  promo: number;
}

export const printingColumns: (keyof PrintingRecord)[] = [
  'id',
  'oracle_id',
  'name',
  'lang',
  'set_code',
  'set_name',
  'set_type',
  'collector_number',
  'released_at',
  'layout',
  'type_line',
  'mana_cost',
  'cmc',
  'colors',
  'color_identity',
  'power',
  'toughness',
  'loyalty',
  'defense',
  'keywords',
  'oracle_text',
  'rarity',
  'digital',
  'faces',
  'name_key',
  'front_key',
  'promo',
];

const toFace = (face: ScryfallFace, fallbackImage?: string): PrintingFace => {
  const out: PrintingFace = {
    name: face.name ?? '',
    typeLine: face.type_line ?? '',
  };
  if (face.mana_cost) out.manaCost = face.mana_cost;
  if (face.oracle_text) out.oracleText = face.oracle_text;
  if (face.power !== undefined) out.power = face.power;
  if (face.toughness !== undefined) out.toughness = face.toughness;
  if (face.loyalty !== undefined) out.loyalty = face.loyalty;
  if (face.defense !== undefined) out.defense = face.defense;
  const image = face.image_uris?.normal ?? fallbackImage;
  if (image) out.image = image;
  return out;
};

// Split, flip, and adventure cards list faces but share one image; double-
// faced cards carry an image per face. Either way every face gets one.
export const toFaces = (card: ScryfallCard): PrintingFace[] => {
  const cardImage = card.image_uris?.normal;
  if (card.card_faces?.length) {
    return card.card_faces.map((face) => toFace(face, cardImage));
  }
  return [toFace(card)];
};

export const toPrintingRecord = (card: ScryfallCard): PrintingRecord => {
  const faces = toFaces(card);
  const front = faces[0];
  const oracleText =
    card.oracle_text ??
    (faces.some((f) => f.oracleText)
      ? faces.map((f) => f.oracleText ?? '').join('\n//\n')
      : null);

  return {
    id: card.id,
    oracle_id: card.oracle_id ?? null,
    name: card.name,
    lang: card.lang,
    set_code: card.set,
    set_name: card.set_name,
    set_type: card.set_type ?? null,
    collector_number: card.collector_number,
    released_at: card.released_at ?? null,
    layout: card.layout,
    type_line: card.type_line ?? null,
    mana_cost: card.mana_cost ?? front.manaCost ?? null,
    cmc: card.cmc ?? null,
    colors: JSON.stringify(card.colors ?? []),
    color_identity: JSON.stringify(card.color_identity ?? []),
    power: card.power ?? front.power ?? null,
    toughness: card.toughness ?? front.toughness ?? null,
    loyalty: card.loyalty ?? front.loyalty ?? null,
    defense: card.defense ?? front.defense ?? null,
    keywords: JSON.stringify(card.keywords ?? []),
    oracle_text: oracleText,
    rarity: card.rarity ?? null,
    digital: card.digital ? 1 : 0,
    faces: JSON.stringify(faces),
    name_key: nameKey(card.name),
    front_key: frontKey(card.name),
    promo: card.promo || card.set_type === 'promo' ? 1 : 0,
  };
};

// Keyrune names token and promo symbols after their parent set, which
// Scryfall prefixes with one letter (tm21 -> m21, pm21 -> m21).
export const keyruneCode = (code: string, setType: string | null): string => {
  const lower = code.toLowerCase();
  const prefixed = setType === 'token' || setType === 'promo';
  if (prefixed && lower.length === 4 && /^[tp]/.test(lower)) {
    return lower.slice(1);
  }
  return lower;
};
