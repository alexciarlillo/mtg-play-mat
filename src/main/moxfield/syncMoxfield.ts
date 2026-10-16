import type { UnresolvedSyncCard } from '@shared/moxfield';
import type { DeckFormat, NewDeckCard } from '@shared/types/decks';

import {
  dropListedCompanions,
  type ParsedCardLine,
} from '../decks/parseDeckList';
import {
  type CandidateLookup,
  resolveDeckList,
} from '../decks/resolveDeckList';
import type { LocalMoxfieldDeck, MoxfieldDeckWrite } from '../shared/db/DeckDB';
import {
  type MoxfieldDeck,
  type MoxfieldDeckRef,
  MoxfieldError,
} from './moxfieldApi';
import type { MoxfieldClient } from './moxfieldClient';

// 1000 decks; past that the list can't be trusted to be complete, and
// an incomplete list would flag real decks as gone.
export const MAX_PAGES = 20;

export interface SyncPlan {
  // Decks that are new or changed upstream, fetched in full.
  fetched: { deck: MoxfieldDeck; isNew: boolean }[];
  unchanged: MoxfieldDeckRef[];
  gone: LocalMoxfieldDeck[];
  // False when the list changed while it was read, so a missing deck may
  // only have moved between pages; nothing is flagged gone then.
  complete: boolean;
  // Decks that couldn't be fetched; the local copy, if any, is kept.
  failed: { ref: MoxfieldDeckRef; error: string }[];
}

export interface PlanDeps {
  client: MoxfieldClient;
  user: string;
  local: LocalMoxfieldDeck[];
  // Every synced deck's Moxfield id, whoever's list it came from.
  knownIds: Set<string>;
  signal: AbortSignal;
  // Spaces requests out, so a sync never hammers Moxfield.
  pause(signal: AbortSignal): Promise<void>;
  onProgress?(done: number, total: number): void;
}

// Only problems with one deck are worth carrying on past; anything that
// says Moxfield itself is unreachable or refusing stops the whole run.
const deckOnly = (err: unknown) =>
  err instanceof MoxfieldError &&
  (err.kind === 'schema' || err.kind === 'notFound');

const listAll = async ({
  client,
  user,
  signal,
  pause,
}: PlanDeps): Promise<{ refs: MoxfieldDeckRef[]; complete: boolean }> => {
  const byId = new Map<string, MoxfieldDeckRef>();
  const totals = new Set<number>();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    if (page > 1) await pause(signal);
    const result = await client.searchPage(user, page, signal);
    if (result.totalPages > MAX_PAGES) {
      throw new MoxfieldError(
        'schema',
        `"${user}" has more public decks than this app can sync (1000).`
      );
    }
    totalPages = result.totalPages;
    totals.add(result.totalResults);
    // A deck added or deleted mid-sync can shift one onto two pages.
    result.decks.forEach((ref) => byId.set(ref.publicId, ref));
  }
  // The count holds still and every deck was seen, so none was skipped.
  const complete = totals.size === 1 && totals.has(byId.size);
  return { refs: [...byId.values()], complete };
};

// Works out what changed upstream and fetches only those decks. Nothing
// is written here; any error other than one bad deck throws.
export const planSync = async (deps: PlanDeps): Promise<SyncPlan> => {
  const { client, local, knownIds, signal, pause, onProgress } = deps;
  const { refs: remote, complete } = await listAll(deps);
  const localById = new Map(local.map((d) => [d.publicId, d]));
  const remoteIds = new Set(remote.map((r) => r.publicId));

  const toFetch = remote.filter(
    (ref) => localById.get(ref.publicId)?.remoteUpdatedAt !== ref.lastUpdatedAt
  );
  const plan: SyncPlan = {
    fetched: [],
    unchanged: remote.filter((ref) => !toFetch.includes(ref)),
    gone: complete ? local.filter((d) => !remoteIds.has(d.publicId)) : [],
    complete,
    failed: [],
  };

  onProgress?.(0, toFetch.length);
  for (const [i, ref] of toFetch.entries()) {
    await pause(signal);
    try {
      const deck = await client.getDeck(ref.publicId, signal);
      plan.fetched.push({ deck, isNew: !knownIds.has(ref.publicId) });
    } catch (err) {
      if (!deckOnly(err)) throw err;
      plan.failed.push({ ref, error: (err as Error).message });
    }
    onProgress?.(i + 1, toFetch.length);
  }
  return plan;
};

export interface CardLookups {
  byId(ids: string[]): { id: string }[];
  byName: CandidateLookup | null;
}

const commanderFormats = new Set([
  'commander',
  'duelcommander',
  'brawl',
  'historicbrawl',
  'standardbrawl',
  'oathbreaker',
  'pauperedh',
  'commanderprecons',
]);

const toFormat = (deck: MoxfieldDeck): DeckFormat => {
  const format = deck.format.toLowerCase();
  if (deck.cards.some((c) => c.board === 'commander')) return 'commander';
  if (commanderFormats.has(format)) return 'commander';
  if (format === '' || format === 'none') return 'other';
  return 'constructed';
};

// Each card is found by its Scryfall id first, then the way a pasted
// list's line would be: set and number, then name.
export const toDeckWrite = (
  source: MoxfieldDeck,
  lookups: CardLookups
): {
  write: MoxfieldDeckWrite;
  unresolved: UnresolvedSyncCard[];
  notes: string[];
} => {
  // The same rule as a pasted list, so a sync and an import agree.
  const notes: string[] = [];
  const listed = source.cards.map((card) => ({ ...card }));
  dropListedCompanions(listed, notes);
  const deck = { ...source, cards: listed };
  const ids = [
    ...new Set(deck.cards.flatMap((c) => (c.scryfallId ? [c.scryfallId] : []))),
  ];
  const known = new Set(lookups.byId(ids).map((p) => p.id));
  // Kept in Moxfield's order, whichever way each card was found.
  const slots: (NewDeckCard | null)[] = deck.cards.map((card) =>
    card.scryfallId && known.has(card.scryfallId)
      ? { printingId: card.scryfallId, qty: card.qty, board: card.board }
      : null
  );
  const byName: ParsedCardLine[] = deck.cards.flatMap((card, i) =>
    slots[i]
      ? []
      : [
          {
            line: i + 1,
            text: card.name,
            qty: card.qty,
            name: card.name,
            setCode: card.setCode,
            number: card.number,
            board: card.board,
          },
        ]
  );

  const report = resolveDeckList(
    { deckName: null, cards: byName, ignored: [], notes: [] },
    lookups.byName
  );
  report.resolved.forEach((line) => {
    slots[line.line - 1] = {
      printingId: line.printing.id,
      qty: line.qty,
      board: line.board,
    };
  });
  const cards = slots.filter((c) => c !== null);

  const has = (id: string | undefined) =>
    id !== undefined && cards.some((c) => c.printingId === id);
  const cover = has(deck.mainScryfallId)
    ? deck.mainScryfallId!
    : (cards.find((c) => c.board === 'commander') ?? cards[0])?.printingId;

  return {
    write: {
      publicId: deck.publicId,
      name: deck.name,
      format: toFormat(deck),
      author: deck.author,
      remoteUpdatedAt: deck.lastUpdatedAt,
      displayPrintingId: cover ?? null,
      cards,
    },
    notes,
    unresolved: report.unresolved.map((line) => ({
      name: line.name,
      qty: line.qty,
      board: line.board,
      reason: line.reason,
    })),
  };
};
