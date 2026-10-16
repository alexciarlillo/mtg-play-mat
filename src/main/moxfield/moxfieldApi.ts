import { MOXFIELD_PUBLIC_ID, sameMoxfieldUser } from '@shared/moxfield';
import type { DeckBoard } from '@shared/types/decks';

// Moxfield's API is unofficial and can change at any time, so every
// response is checked field by field and anything unexpected stops the
// sync before local decks are touched.

export type MoxfieldErrorKind =
  'network' | 'blocked' | 'notFound' | 'rateLimited' | 'schema' | 'cancelled';

export class MoxfieldError extends Error {
  constructor(
    readonly kind: MoxfieldErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'MoxfieldError';
  }
}

const schema = (what: string): never => {
  throw new MoxfieldError(
    'schema',
    `Moxfield sent something this app doesn't understand (${what}). ` +
      'Its API may have changed.'
  );
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const record = (v: unknown, what: string) => (isRecord(v) ? v : schema(what));

const int = (v: unknown, what: string, min: number, max: number): number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max
    ? (v as number)
    : schema(what);

// Control characters would only garble the deck list.
const clean = (v: string, max: number) =>
  v
    .replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, max);

const text = (v: unknown, what: string, max = 200): string => {
  if (typeof v !== 'string' || v.length > 2000) return schema(what);
  const value = clean(v, max);
  return value === '' ? schema(what) : value;
};

const optionalText = (v: unknown, what: string, max: number) =>
  v === undefined || v === null ? undefined : text(v, what, max);

const publicId = (v: unknown): string =>
  typeof v === 'string' && MOXFIELD_PUBLIC_ID.test(v) ? v : schema('deck id');

const time = (v: unknown, what: string): string =>
  typeof v === 'string' &&
  v.length <= 40 &&
  /^\d{4}-\d\d-\d\dT/.test(v) &&
  !Number.isNaN(Date.parse(v))
    ? v
    : schema(what);

const userName = (v: unknown): string =>
  text(record(v, 'author').userName, 'author', 64);

export interface MoxfieldDeckRef {
  publicId: string;
  name: string;
  lastUpdatedAt: string;
}

export interface MoxfieldSearchPage {
  totalPages: number;
  // Decks the search says match, across all pages.
  totalResults: number;
  decks: MoxfieldDeckRef[];
}

export const SEARCH_PAGE_SIZE = 50;

// The search ignores a username it doesn't know and returns everyone's
// public decks instead: a page of decks none of which are theirs means
// no such user. Any other deck not by them is skipped.
export const parseSearchPage = (
  input: unknown,
  user: string
): MoxfieldSearchPage => {
  const page = record(input, 'search page');
  const totalPages = int(page.totalPages, 'page count', 0, 1_000_000);
  const totalResults = int(page.totalResults, 'deck count', 0, 100_000_000);
  if (!Array.isArray(page.data) || page.data.length > SEARCH_PAGE_SIZE) {
    return schema('deck list');
  }
  const items = page.data.map((raw: unknown) => {
    const item = record(raw, 'deck');
    const authors = [
      userName(item.createdByUser),
      ...(Array.isArray(item.authors) ? item.authors.map(userName) : []),
    ];
    const ref: MoxfieldDeckRef = {
      publicId: publicId(item.publicId),
      name: text(item.name, 'deck name'),
      lastUpdatedAt: time(item.lastUpdatedAtUtc, 'deck update time'),
    };
    return { ref, theirs: authors.some((a) => sameMoxfieldUser(a, user)) };
  });
  if (items.length > 0 && !items.some((i) => i.theirs)) {
    throw new MoxfieldError(
      'notFound',
      `Moxfield has no public decks by "${user}". Check the username.`
    );
  }
  const decks = items.filter((i) => i.theirs).map((i) => i.ref);
  return { totalPages, totalResults, decks };
};

export interface MoxfieldCard {
  board: DeckBoard;
  qty: number;
  name: string;
  scryfallId?: string;
  setCode?: string;
  number?: string;
}

export interface MoxfieldDeck {
  publicId: string;
  name: string;
  format: string;
  author: string;
  lastUpdatedAt: string;
  // Moxfield's featured card, a hint for the cover.
  mainScryfallId?: string;
  cards: MoxfieldCard[];
}

// The boards a play test uses. Maybeboard, tokens, attractions and the
// rest are left out, as a pasted list's maybeboard is. An Oathbreaker's
// signature spell lives in the command zone and pays tax, as a commander.
const boardMap: [string, DeckBoard][] = [
  ['commanders', 'commander'],
  ['signatureSpells', 'commander'],
  ['companions', 'companion'],
  ['mainboard', 'main'],
  ['sideboard', 'side'],
];

const MAX_ENTRIES = 1000;
const MAX_QTY = 999;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids, sets and numbers only guide the card lookup, so an odd one is
// dropped and the card is found by name instead.
const hint = (v: unknown, pattern: RegExp): string | undefined =>
  typeof v === 'string' && pattern.test(v) ? v : undefined;

const parseCard = (raw: unknown, board: DeckBoard): MoxfieldCard | null => {
  const entry = record(raw, 'card entry');
  const qty = int(entry.quantity, 'card quantity', 0, 100_000);
  if (qty === 0) return null;
  const card = record(entry.card, 'card');
  return {
    board,
    qty: Math.min(qty, MAX_QTY),
    name: text(card.name, 'card name'),
    scryfallId: hint(card.scryfall_id, UUID),
    setCode: hint(card.set, /^[a-z0-9]{2,8}$/i),
    number: hint(card.cn, /^[\w★*.-]{1,16}$/u),
  };
};

export const parseDeck = (input: unknown, expectedId: string): MoxfieldDeck => {
  const deck = record(input, 'deck');
  const id = publicId(deck.publicId);
  if (id !== expectedId) schema('deck id');
  const boards = record(deck.boards, 'boards');
  if (!isRecord(boards.mainboard)) schema('main board');

  const cards: MoxfieldCard[] = [];
  boardMap.forEach(([key, board]) => {
    // Moxfield may leave out a board a deck doesn't use.
    if (boards[key] === undefined) return;
    const entries = record(record(boards[key], key).cards, `${key} cards`);
    const values = Object.values(entries);
    if (values.length > MAX_ENTRIES) schema(`${key} size`);
    values.forEach((raw) => {
      const card = parseCard(raw, board);
      if (card) cards.push(card);
    });
  });

  const main = isRecord(deck.main) ? deck.main : {};
  return {
    publicId: id,
    name: text(deck.name, 'deck name'),
    format: optionalText(deck.format, 'format', 40) ?? '',
    author: userName(deck.createdByUser),
    lastUpdatedAt: time(deck.lastUpdatedAtUtc, 'deck update time'),
    mainScryfallId: hint(main.scryfall_id, UUID),
    cards,
  };
};
