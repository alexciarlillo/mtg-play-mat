export const deckFormats = ['commander', 'constructed', 'other'] as const;
export type DeckFormat = (typeof deckFormats)[number];

export const deckBoards = ['main', 'side', 'commander'] as const;
export type DeckBoard = (typeof deckBoards)[number];

// What the deck views need to know about one printing.
export interface PrintingSummary {
  id: string;
  oracleId: string | null;
  name: string;
  layout: string;
  typeLine: string | null;
  manaCost: string | null;
  cmc: number | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  keyruneCode: string;
  releasedAt: string | null;
  lang: string;
  digital: boolean;
  promo: boolean;
}

export interface DeckSummary {
  id: number;
  name: string;
  format: DeckFormat;
  displayPrintingId: string | null;
  // Main plus commander; the sideboard isn't part of the played deck.
  cardCount: number;
  updatedAt: string;
}

export interface DeckCard {
  printingId: string;
  qty: number;
  board: DeckBoard;
  // Null when the card database doesn't have (or doesn't yet have) it.
  printing: PrintingSummary | null;
}

export interface DeckDetail extends DeckSummary {
  createdAt: string;
  cards: DeckCard[];
}

export interface DeckPatch {
  name?: string;
  format?: DeckFormat;
  displayPrintingId?: string | null;
}

export type DeckCardEdit =
  | { type: 'setQty'; printingId: string; board: DeckBoard; qty: number }
  | { type: 'add'; printingId: string; board: DeckBoard; qty: number }
  | { type: 'move'; printingId: string; from: DeckBoard; to: DeckBoard }
  | {
      type: 'setPrinting';
      printingId: string;
      board: DeckBoard;
      newPrintingId: string;
    };

export interface NewDeckCard {
  printingId: string;
  qty: number;
  board: DeckBoard;
}

export interface NewDeck {
  name: string;
  format: DeckFormat;
  cards: NewDeckCard[];
  displayPrintingId?: string | null;
}

export type MatchKind = 'set+number' | 'name+set' | 'name';

export interface ResolvedImportLine {
  // 1-based line number in the pasted text.
  line: number;
  text: string;
  qty: number;
  board: DeckBoard;
  printing: PrintingSummary;
  matchedBy: MatchKind;
  // e.g. the requested set wasn't found, so a default printing was used.
  warning?: string;
}

export interface UnresolvedImportLine {
  line: number;
  text: string;
  qty: number;
  board: DeckBoard;
  name: string;
  reason: string;
}

export type IgnoredReason = 'maybeboard' | 'about' | 'comment' | 'zero';

export interface IgnoredImportLine {
  line: number;
  text: string;
  reason: IgnoredReason;
}

export interface DeckImportReport {
  deckName: string | null;
  format: DeckFormat;
  resolved: ResolvedImportLine[];
  unresolved: UnresolvedImportLine[];
  ignored: IgnoredImportLine[];
  // Parser decisions worth showing, such as an implied sideboard.
  notes: string[];
  cardDataMissing: boolean;
}

// One result of a card name search: a card, not a printing.
export interface CardNameResult {
  oracleId: string | null;
  name: string;
  typeLine: string | null;
  // The printing a name-only import would pick.
  defaultPrinting: PrintingSummary;
}
