import { nameKey } from '@shared/cardNames';
import type {
  CardNameResult,
  DeckImportReport,
  ResolvedImportLine,
  UnresolvedImportLine,
} from '@shared/types/decks';

import { type PrintingCandidate, toSummary } from '../shared/db/CardDB';
import type { ParsedCardLine, ParsedDeckList } from './parseDeckList';

export type CandidateLookup = (key: string) => PrintingCandidate[];

// Set types whose printings aren't what a player means by "the card":
// collectors' products, supplemental game modes, and memorabilia.
const oddSetTypes = new Set([
  'memorabilia',
  'funny',
  'token',
  'minigame',
  'alchemy',
  'box',
  'masterpiece',
  'from_the_vault',
  'spellbook',
  'premium_deck',
  'arsenal',
  'treasure_chest',
  'vanguard',
  'planechase',
  'archenemy',
]);
const nonCardLayouts = new Set(['token', 'double_faced_token', 'emblem']);

// Plain numbers mark a set's regular printing; variants look like "123s",
// "★12", or "CLB-187" (a reprint list).
const isPlainNumber = (n: string) => /^\d+$/.test(n);

const today = () => new Date().toISOString().slice(0, 10);

// Lower sorts first: the most recent English, paper, non-promo printing
// that has an image, among released cards from ordinary sets.
const compareDefault =
  (key: string, now: string) =>
  (a: PrintingCandidate, b: PrintingCandidate) => {
    const flags = (c: PrintingCandidate) => [
      c.nameKey === key ? 0 : 1,
      nonCardLayouts.has(c.layout) ? 1 : 0,
      c.lang === 'en' ? 0 : 1,
      c.digital ? 1 : 0,
      c.hasImage ? 0 : 1,
      c.promo ? 1 : 0,
      c.setType && oddSetTypes.has(c.setType) ? 1 : 0,
      (c.releasedAt ?? '') > now ? 1 : 0,
      isPlainNumber(c.collectorNumber) ? 0 : 1,
    ];
    const fa = flags(a);
    const fb = flags(b);
    for (let i = 0; i < fa.length; i += 1) {
      if (fa[i] !== fb[i]) return fa[i] - fb[i];
    }
    const date = (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '');
    if (date !== 0) return date;
    return Number(a.collectorNumber) - Number(b.collectorNumber) || 0;
  };

export const pickDefault = (
  candidates: PrintingCandidate[],
  key: string,
  now = today()
): PrintingCandidate | undefined =>
  [...candidates].sort(compareDefault(key, now))[0];

// Collector numbers compare case-insensitively and ignore leading zeros,
// and "*" stands in for Scryfall's "★".
const normalizeNumber = (n: string) =>
  n
    .toLowerCase()
    .replace(/\*/g, '★')
    .replace(/^0+(?=.)/, '');

const sameSet = (c: PrintingCandidate, set: string) =>
  c.setCode.toLowerCase() === set.toLowerCase();

type Resolution =
  | Omit<ResolvedImportLine, 'line' | 'text' | 'qty' | 'board'>
  | { reason: string };

const resolveLine = (
  card: ParsedCardLine,
  lookup: CandidateLookup
): Resolution => {
  const key = nameKey(card.name);
  if (key === '') return { reason: 'No card name on this line' };
  const candidates = lookup(key);
  if (candidates.length === 0) {
    return { reason: `No card named "${card.name}"` };
  }

  const { setCode, number } = card;
  if (setCode) {
    const inSet = candidates.filter((c) => sameSet(c, setCode));
    if (number) {
      const wanted = normalizeNumber(number);
      const exact = inSet.find(
        (c) => normalizeNumber(c.collectorNumber) === wanted
      );
      if (exact) return { printing: toSummary(exact), matchedBy: 'set+number' };
    }
    const best = pickDefault(inSet, key);
    if (best) {
      return {
        printing: toSummary(best),
        matchedBy: 'name+set',
        ...(number && {
          warning: `No #${number} in ${setCode.toUpperCase()}; used another printing from that set`,
        }),
      };
    }
  }

  const best = pickDefault(candidates, key)!;
  return {
    printing: toSummary(best),
    matchedBy: 'name',
    ...(setCode && {
      warning: `Not printed in ${setCode.toUpperCase()}; used the default printing`,
    }),
  };
};

export const resolveDeckList = (
  parsed: ParsedDeckList,
  lookup: CandidateLookup | null
): DeckImportReport => {
  const resolved: ResolvedImportLine[] = [];
  const unresolved: UnresolvedImportLine[] = [];

  parsed.cards.forEach((card) => {
    const base = {
      line: card.line,
      text: card.text,
      qty: card.qty,
      board: card.board,
    };
    const result = lookup
      ? resolveLine(card, lookup)
      : { reason: 'No card data yet' };
    if ('reason' in result) {
      unresolved.push({ ...base, name: card.name, reason: result.reason });
    } else {
      resolved.push({ ...base, ...result });
    }
  });

  const hasCommander = parsed.cards.some((c) => c.board === 'commander');
  return {
    deckName: parsed.deckName,
    format: hasCommander ? 'commander' : 'constructed',
    resolved,
    unresolved,
    ignored: parsed.ignored,
    notes: parsed.notes,
    cardDataMissing: lookup === null,
  };
};

// Groups printings into cards (by oracle id) for name search results.
export const toCardResults = (
  candidates: PrintingCandidate[],
  limit = 30
): CardNameResult[] => {
  const byCard = new Map<string, PrintingCandidate[]>();
  candidates.forEach((c) => {
    const id = c.oracleId ?? c.name;
    byCard.set(id, [...(byCard.get(id) ?? []), c]);
  });
  return [...byCard.values()]
    .map((printings) => {
      const best = pickDefault(printings, printings[0].nameKey)!;
      return {
        oracleId: best.oracleId,
        name: best.name,
        typeLine: best.typeLine,
        defaultPrinting: toSummary(best),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
};
