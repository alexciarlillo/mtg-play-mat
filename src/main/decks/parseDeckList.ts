import type {
  DeckBoard,
  IgnoredImportLine,
  IgnoredReason,
} from '@shared/types/decks';

export type Finish = 'foil' | 'etched';

export interface ParsedCardLine {
  line: number;
  text: string;
  qty: number;
  name: string;
  setCode?: string;
  number?: string;
  finish?: Finish;
  board: DeckBoard;
}

export interface ParsedDeckList {
  deckName: string | null;
  cards: ParsedCardLine[];
  ignored: IgnoredImportLine[];
  notes: string[];
}

type Section = DeckBoard | 'maybe' | 'about';

// Section headers, keyed by their lowercased text.
const sectionHeaders: Record<string, Section> = {
  deck: 'main',
  main: 'main',
  maindeck: 'main',
  'main deck': 'main',
  mainboard: 'main',
  sideboard: 'side',
  side: 'side',
  'side board': 'side',
  companion: 'side',
  companions: 'side',
  commander: 'commander',
  commanders: 'commander',
  maybeboard: 'maybe',
  maybe: 'maybe',
  considering: 'maybe',
  about: 'about',
};

// Type groupings some sites put between cards; they don't change boards.
const categoryHeaders = new Set([
  'creature',
  'creatures',
  'instant',
  'instants',
  'sorcery',
  'sorceries',
  'artifact',
  'artifacts',
  'enchantment',
  'enchantments',
  'planeswalker',
  'planeswalkers',
  'battle',
  'battles',
  'land',
  'lands',
  'spells',
  'other',
  'tokens',
]);

const HEADER = /^(?:\/\/\s*)?([a-z][a-z ]*?)\s*(?:\(\d+\))?\s*:?\s*$/i;

// qty (optional, "4" or "4x"), name, then an optional "(SET) number" and
// Moxfield finish markers such as *F* or *E*.
const CARD =
  /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+[([]([A-Za-z0-9]{2,8})[)\]](?:\s+([^\s*()[\]][^\s()[\]]*))?)?((?:\s+\*[A-Za-z]+\*)*)$/;

const finishOf = (markers: string): Finish | undefined => {
  if (/\*E\*/i.test(markers)) return 'etched';
  if (/\*F\*/i.test(markers)) return 'foil';
  return undefined;
};

const headerSection = (text: string): Section | 'category' | null => {
  const match = HEADER.exec(text);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (word in sectionHeaders) return sectionHeaders[word];
  if (categoryHeaders.has(word)) return 'category';
  return null;
};

export const parseCardText = (
  text: string
): Pick<ParsedCardLine, 'qty' | 'name' | 'setCode' | 'number' | 'finish'> => {
  // Moxfield appends user tags like "#Ramp"; card names never contain '#'.
  const withoutTags = text.replace(/\s+#\S.*$/, '');
  const match = CARD.exec(withoutTags)!;
  const [, qty, name, setCode, number, markers] = match;
  return {
    qty: qty === undefined ? 1 : Number(qty),
    name: name.trim(),
    ...(setCode && { setCode }),
    ...(number && { number }),
    ...(markers && finishOf(markers) && { finish: finishOf(markers) }),
  };
};

// Parses plain, MTGA, and Moxfield text exports. It never looks cards up;
// every non-blank line ends up as a card, a header, or an ignored line.
export const parseDeckList = (input: string): ParsedDeckList => {
  const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const cards: ParsedCardLine[] = [];
  const ignored: IgnoredImportLine[] = [];
  const notes: string[] = [];
  let deckName: string | null = null;

  let section: Section = 'main';
  let explicitSideboard = false;
  // Card groups in the header-less (or "Deck") main section, split on
  // blank lines; MTGA puts the sideboard after the last blank line.
  let mainGroups: ParsedCardLine[][] = [];
  let groupOpen = false;

  const ignore = (line: number, text: string, reason: IgnoredReason) =>
    ignored.push({ line, text, reason });

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();

    if (text === '') {
      groupOpen = false;
      // A blank line ends the About block in MTGA exports.
      if (section === 'about') section = 'main';
      return;
    }

    const header = headerSection(text);
    if (header === 'category') return;
    if (header) {
      section = header;
      groupOpen = false;
      if (header === 'side') explicitSideboard = true;
      return;
    }

    if (section === 'about') {
      const name = /^name\s+(.+)$/i.exec(text);
      if (name && deckName === null) deckName = name[1].trim();
      else ignore(line, text, 'about');
      return;
    }

    // MTGA "Name My Deck" can also appear without an About header.
    const nameLine = /^name\s+(.+)$/i.exec(text);
    if (nameLine && deckName === null && cards.length === 0) {
      deckName = nameLine[1].trim();
      return;
    }

    if (text.startsWith('//') || text.startsWith('#')) {
      ignore(line, text, 'comment');
      return;
    }

    // MTGO-style "SB: 2 Name" marks a sideboard card inline.
    const sb = /^SB:\s*(.+)$/i.exec(text);
    const parsed = parseCardText(sb ? sb[1] : text);
    if (section === 'maybe') {
      ignore(line, text, 'maybeboard');
      return;
    }
    if (parsed.qty === 0) {
      ignore(line, text, 'zero');
      return;
    }

    const card: ParsedCardLine = {
      line,
      text,
      ...parsed,
      board: sb ? 'side' : section,
    };
    cards.push(card);
    if (sb) explicitSideboard = true;

    if (section === 'main' && !sb) {
      if (!groupOpen) mainGroups.push([]);
      mainGroups[mainGroups.length - 1].push(card);
      groupOpen = true;
    }
  });

  if (explicitSideboard) mainGroups = [];
  if (mainGroups.length > 1) {
    const sideboard = mainGroups[mainGroups.length - 1];
    sideboard.forEach((card) => {
      card.board = 'side';
    });
    notes.push(
      `Treated the ${sideboard.length} line(s) after the last blank line ` +
        `(from line ${sideboard[0].line}) as the sideboard.`
    );
  }

  const maybe = ignored.filter((i) => i.reason === 'maybeboard').length;
  if (maybe > 0) {
    notes.push(`Skipped ${maybe} maybeboard line(s).`);
  }

  return { deckName, cards, ignored, notes };
};
