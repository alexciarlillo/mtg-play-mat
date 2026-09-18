import { nameKey } from '@shared/cardNames';
import {
  type DeckBoard,
  deckBoards,
  type DeckCard,
  type DeckCardEdit,
  type DeckDetail,
  type DeckFormat,
  deckFormats,
  type DeckPatch,
  type DeckSummary,
  type NewDeck,
} from '@shared/types/decks';

import { parseDeckList } from '../../decks/parseDeckList';
import { resolveDeckList, toCardResults } from '../../decks/resolveDeckList';
import type { RequestHandlers } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import { toSummary } from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { type DeckMetaRow, MAX_QTY } from '../../shared/db/DeckDB';

interface Deps {
  cardDb: CardDB;
  deckDb: DeckDB;
}

type DeckHandlers = Pick<
  RequestHandlers,
  | 'listDecks'
  | 'previewDeckImport'
  | 'createDeck'
  | 'getDeck'
  | 'updateDeck'
  | 'editDeckCards'
  | 'deleteDeck'
  | 'searchCardNames'
  | 'listPrintings'
>;

// Renderer input is untrusted, so every argument is checked here.
const fail = (what: string): never => {
  throw new Error(`[decks] invalid ${what}`);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const id = (v: unknown): number =>
  Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : fail('id');

const text = (v: unknown, what: string, max = 200_000): string =>
  typeof v === 'string' && v.length <= max ? v : fail(what);

const deckName = (v: unknown): string => {
  const name = text(v, 'name', 200).trim();
  return name === '' ? fail('name') : name;
};

const printingId = (v: unknown): string =>
  typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : fail('printing');

const board = (v: unknown): DeckBoard =>
  deckBoards.includes(v as DeckBoard) ? (v as DeckBoard) : fail('board');

const format = (v: unknown): DeckFormat =>
  deckFormats.includes(v as DeckFormat) ? (v as DeckFormat) : fail('format');

const qty = (v: unknown, min: number): number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= MAX_QTY
    ? (v as number)
    : fail('quantity');

const parseNewDeck = (v: unknown): NewDeck => {
  if (!isRecord(v) || !Array.isArray(v.cards)) return fail('deck');
  return {
    name: deckName(v.name),
    format: format(v.format),
    cards: v.cards.map((c: unknown) =>
      isRecord(c)
        ? {
            printingId: printingId(c.printingId),
            qty: qty(c.qty, 1),
            board: board(c.board),
          }
        : fail('card')
    ),
    displayPrintingId:
      v.displayPrintingId == null ? null : printingId(v.displayPrintingId),
  };
};

const parsePatch = (v: unknown): DeckPatch => {
  if (!isRecord(v)) return fail('patch');
  return {
    ...(v.name !== undefined && { name: deckName(v.name) }),
    ...(v.format !== undefined && { format: format(v.format) }),
    ...(v.displayPrintingId !== undefined && {
      displayPrintingId:
        v.displayPrintingId === null ? null : printingId(v.displayPrintingId),
    }),
  };
};

const parseEdit = (v: unknown): DeckCardEdit => {
  if (!isRecord(v)) return fail('edit');
  const pid = printingId(v.printingId);
  switch (v.type) {
    case 'setQty':
      return {
        type: 'setQty',
        printingId: pid,
        board: board(v.board),
        qty: qty(v.qty, 0),
      };
    case 'add':
      return {
        type: 'add',
        printingId: pid,
        board: board(v.board),
        qty: qty(v.qty, 1),
      };
    case 'move':
      return {
        type: 'move',
        printingId: pid,
        from: board(v.from),
        to: board(v.to),
      };
    case 'setPrinting':
      return {
        type: 'setPrinting',
        printingId: pid,
        board: board(v.board),
        newPrintingId: printingId(v.newPrintingId),
      };
    default:
      return fail('edit');
  }
};

const createDeckHandlers = ({ cardDb, deckDb }: Deps): DeckHandlers => {
  const toSummaryRow = (row: DeckMetaRow): DeckSummary => ({
    id: row.id,
    name: row.name,
    format: row.format,
    displayPrintingId: row.displayPrintingId,
    cardCount: row.cardCount,
    updatedAt: row.updatedAt,
  });

  const listDecks = () => deckDb.listDecks().map(toSummaryRow);

  const getDeck = (deckId: number): DeckDetail | null => {
    const meta = deckDb.getDeck(deckId);
    if (!meta) return null;
    const rows = deckDb.getDeckCards(deckId);
    const printings = new Map(
      cardDb
        .summariesByIds([...new Set(rows.map((r) => r.printingId))])
        .map((p) => [p.id, toSummary(p)])
    );
    const cards: DeckCard[] = rows.map((row) => ({
      ...row,
      printing: printings.get(row.printingId) ?? null,
    }));
    return { ...toSummaryRow(meta), createdAt: meta.createdAt, cards };
  };

  return {
    listDecks,
    previewDeckImport: (deckList) => {
      const parsed = parseDeckList(text(deckList, 'deck list'));
      return resolveDeckList(
        parsed,
        cardDb.available ? cardDb.candidatesByName : null
      );
    },
    createDeck: (deck) => deckDb.createDeck(parseNewDeck(deck)),
    getDeck: (deckId) => getDeck(id(deckId)),
    updateDeck: (deckId, patch) => {
      deckDb.updateDeck(id(deckId), parsePatch(patch));
      return getDeck(deckId);
    },
    editDeckCards: (deckId, edit) => {
      deckDb.editCards(id(deckId), parseEdit(edit));
      return getDeck(deckId);
    },
    deleteDeck: (deckId) => {
      deckDb.deleteDeck(id(deckId));
      return listDecks();
    },
    searchCardNames: (query) => {
      const q = text(query, 'query', 200);
      const key = nameKey(q);
      if (key.length < 2) return [];
      // Names that start with the query come first.
      return toCardResults(cardDb.candidatesMatching(q), 30)
        .sort(
          (a, b) =>
            Number(!nameKey(a.name).startsWith(key)) -
            Number(!nameKey(b.name).startsWith(key))
        )
        .slice(0, 30);
    },
    listPrintings: (pid) => cardDb.printingsOf(printingId(pid)).map(toSummary),
  };
};

export default createDeckHandlers;
