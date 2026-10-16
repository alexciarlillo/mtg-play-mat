// @vitest-environment node
import { nameKey } from '@shared/cardNames';
import { describe, expect, it, vi } from 'vitest';

import type { PrintingCandidate } from '../shared/db/CardDB';
import { COMPANION, deckFixture, SATORU, SLIMEFOOT } from './fixtures';
import {
  type MoxfieldDeck,
  type MoxfieldDeckRef,
  MoxfieldError,
  type MoxfieldSearchPage,
  parseDeck,
} from './moxfieldApi';
import type { MoxfieldClient } from './moxfieldClient';
import { MAX_PAGES, planSync, toDeckWrite } from './syncMoxfield';

const ref = (publicId: string, lastUpdatedAt: string): MoxfieldDeckRef => ({
  publicId,
  name: publicId,
  lastUpdatedAt,
});

const fakeClient = (
  pages: MoxfieldDeckRef[][],
  getDeck: MoxfieldClient['getDeck'] = async (id) =>
    ({ publicId: id }) as MoxfieldDeck
) => ({
  searchPage: vi.fn(
    async (
      _user: string,
      page: number,
      _signal: AbortSignal
    ): Promise<MoxfieldSearchPage> => ({
      totalPages: pages.length,
      totalResults: new Set(pages.flat().map((r) => r.publicId)).size,
      decks: pages[page - 1],
    })
  ),
  getDeck: vi.fn(getDeck),
});

const plan = (
  client: MoxfieldClient,
  local: { id: number; publicId: string; remoteUpdatedAt: string }[] = [],
  otherIds: string[] = []
) =>
  planSync({
    client,
    user: 'aciarlillo',
    local: local.map((d) => ({ ...d, name: `Local ${d.id}` })),
    knownIds: new Set([...local.map((d) => d.publicId), ...otherIds]),
    signal: new AbortController().signal,
    pause: async () => undefined,
  });

describe('planSync', () => {
  it('fetches only new and changed decks, and finds gone ones', async () => {
    const client = fakeClient([
      [ref('new', 't2'), ref('changed', 't2')],
      [ref('same', 't1'), ref('changed', 't2')],
    ]);
    const result = await plan(client, [
      { id: 1, publicId: 'changed', remoteUpdatedAt: 't1' },
      { id: 2, publicId: 'same', remoteUpdatedAt: 't1' },
      { id: 3, publicId: 'deleted', remoteUpdatedAt: 't1' },
    ]);
    expect(client.searchPage.mock.calls.map((c) => c[1])).toEqual([1, 2]);
    expect(client.getDeck.mock.calls.map((c) => c[0])).toEqual([
      'new',
      'changed',
    ]);
    expect(result.fetched.map((f) => [f.deck.publicId, f.isNew])).toEqual([
      ['new', true],
      ['changed', false],
    ]);
    expect(result.unchanged.map((r) => r.publicId)).toEqual(['same']);
    expect(result.gone.map((d) => d.publicId)).toEqual(['deleted']);
    expect(result.complete).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it('flags nothing gone when the list moved while it was read', async () => {
    const local = [{ id: 3, publicId: 'missed', remoteUpdatedAt: 't1' }];
    // A deck created mid-sync pushed one onto a page already read.
    const shifted = fakeClient([[ref('a', 't')], [ref('b', 't')]]);
    shifted.searchPage.mockImplementationOnce(async () => ({
      totalPages: 2,
      totalResults: 3,
      decks: [ref('a', 't')],
    }));
    const moved = await plan(shifted, local);
    expect(moved.complete).toBe(false);
    expect(moved.gone).toEqual([]);
    expect(moved.fetched.map((f) => f.deck.publicId)).toEqual(['a', 'b']);

    // The count held, but fewer decks came back than it says.
    const short = fakeClient([[ref('a', 't')]]);
    short.searchPage.mockResolvedValueOnce({
      totalPages: 1,
      totalResults: 2,
      decks: [ref('a', 't')],
    });
    expect((await plan(short, local)).gone).toEqual([]);
  });

  it("counts a deck from another user's list as known, not new", async () => {
    const client = fakeClient([[ref('shared', 't2')]]);
    const result = await plan(client, [], ['shared']);
    expect(result.fetched.map((f) => f.isNew)).toEqual([false]);
  });

  it('spaces out requests and reports progress', async () => {
    const pause = vi.fn(async () => undefined);
    const onProgress = vi.fn();
    await planSync({
      client: fakeClient([[ref('a', 't')], [ref('b', 't')]]),
      user: 'u',
      local: [],
      knownIds: new Set(),
      signal: new AbortController().signal,
      pause,
      onProgress,
    });
    // Before page 2, and before each deck.
    expect(pause).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('carries on past one bad deck and keeps its local copy', async () => {
    const client = fakeClient(
      [[ref('bad', 't2'), ref('good', 't2')]],
      async (id) => {
        if (id === 'bad') throw new MoxfieldError('schema', 'odd deck');
        return { publicId: id } as MoxfieldDeck;
      }
    );
    const result = await plan(client, [
      { id: 1, publicId: 'bad', remoteUpdatedAt: 't1' },
    ]);
    expect(result.failed).toEqual([
      { ref: ref('bad', 't2'), error: 'odd deck' },
    ]);
    expect(result.fetched.map((f) => f.deck.publicId)).toEqual(['good']);
    expect(result.gone).toEqual([]);
  });

  it('stops on anything that says Moxfield itself is unavailable', async () => {
    for (const kind of [
      'network',
      'blocked',
      'rateLimited',
      'cancelled',
    ] as const) {
      const client = fakeClient([[ref('a', 't')]], async () => {
        throw new MoxfieldError(kind, kind);
      });
      await expect(plan(client)).rejects.toMatchObject({ kind });
    }
  });

  it('refuses a list too long to trust as complete', async () => {
    const client = fakeClient([[ref('a', 't')]]);
    client.searchPage.mockResolvedValueOnce({
      totalPages: MAX_PAGES + 1,
      totalResults: 0,
      decks: [],
    });
    await expect(plan(client)).rejects.toMatchObject({ kind: 'schema' });
    expect(client.getDeck).not.toHaveBeenCalled();
  });
});

// A card database that knows a few printings by id and by name.
const printing = (
  id: string,
  name: string,
  setCode: string,
  collectorNumber: string
): PrintingCandidate =>
  ({
    id,
    name,
    setCode,
    collectorNumber,
    nameKey: name.toLowerCase(),
    frontKey: name.toLowerCase(),
    layout: 'normal',
    lang: 'en',
    digital: false,
    promo: false,
    hasImage: true,
    setType: 'expansion',
    releasedAt: '2020-01-01',
  }) as PrintingCandidate;

const SATORU_NEO = '8887f26d-b097-4fbc-9c48-bdc656409a32';
const ISLAND_CLB = 'c9c9ea23-93c5-4aae-9786-3b3c03a07778';
const SWAMP_OTHER = '00000000-0000-4000-8000-000000000001';
const SIGNET_OTHER = '00000000-0000-4000-8000-000000000002';
const SIGNET_CMR = '00000000-0000-4000-8000-000000000003';

const db = [
  printing(SATORU_NEO, 'Satoru Umezawa', 'neo', '234'),
  printing(ISLAND_CLB, 'Island', 'clb', '458'),
  printing(SWAMP_OTHER, 'Swamp', 'xyz', '1'),
  printing(SIGNET_OTHER, 'Arcane Signet', 'c21', '234'),
  printing(SIGNET_CMR, 'Arcane Signet', 'cmr', '297'),
];

const lookups = {
  byId: (ids: string[]) => db.filter((p) => ids.includes(p.id)),
  byName: (key: string) => db.filter((p) => p.nameKey === key),
};

describe('toDeckWrite', () => {
  const satoru = () => parseDeck(deckFixture(SATORU), SATORU);

  it('finds cards by id, then set and number, then name', () => {
    const { write, unresolved } = toDeckWrite(satoru(), lookups);
    expect(write).toMatchObject({
      publicId: SATORU,
      name: 'Satoru Home Wrecker',
      format: 'commander',
      author: 'aciarlillo',
      remoteUpdatedAt: '2023-03-13T00:56:39.627Z',
    });
    expect(write.cards).toEqual([
      { printingId: SATORU_NEO, qty: 1, board: 'commander' },
      { printingId: ISLAND_CLB, qty: 7, board: 'main' },
      // Not this id in the database, and no m21 printing: by name.
      { printingId: SWAMP_OTHER, qty: 7, board: 'main' },
      // Not this id either, but its set and number are there.
      { printingId: SIGNET_CMR, qty: 1, board: 'main' },
    ]);
    expect(unresolved).toEqual([
      expect.objectContaining({
        name: 'Temple of Deceit',
        qty: 1,
        board: 'main',
      }),
      expect.objectContaining({ name: 'Command Tower' }),
      expect.objectContaining({ name: 'Arcane Denial' }),
    ]);
  });

  it("covers the deck with Moxfield's featured card when it is in it", () => {
    const deck = satoru();
    expect(toDeckWrite(deck, lookups).write.displayPrintingId).toBe(SATORU_NEO);
    deck.mainScryfallId = ISLAND_CLB;
    expect(toDeckWrite(deck, lookups).write.displayPrintingId).toBe(ISLAND_CLB);
    deck.cards = deck.cards.filter((c) => c.board !== 'commander');
    deck.mainScryfallId = undefined;
    expect(toDeckWrite(deck, lookups).write.displayPrintingId).toBe(ISLAND_CLB);
    deck.cards = [];
    expect(toDeckWrite(deck, lookups).write.displayPrintingId).toBeNull();
  });

  it('reads the format from the commander and Moxfield format', () => {
    const format = (f: string, withCommander: boolean) => {
      const deck = satoru();
      deck.format = f;
      if (!withCommander) {
        deck.cards = deck.cards.filter((c) => c.board !== 'commander');
      }
      return toDeckWrite(deck, lookups).write.format;
    };
    expect(format('modern', true)).toBe('commander');
    expect(format('oathbreaker', false)).toBe('commander');
    expect(format('modern', false)).toBe('constructed');
    expect(format('none', false)).toBe('other');
    expect(format('', false)).toBe('other');
  });

  it('leaves every card unresolved without card data', () => {
    const { write, unresolved } = toDeckWrite(satoru(), {
      byId: () => [],
      byName: null,
    });
    expect(write.cards).toEqual([]);
    expect(unresolved).toHaveLength(7);
    expect(unresolved[0].reason).toBe('No card data yet');
  });

  it('maps the companion and sideboard, and leaves the maybeboard', () => {
    const json = deckFixture(SLIMEFOOT);
    const boards = json.boards as Record<string, { cards: object }>;
    const forest = Object.values(boards.mainboard.cards)[0] as object;
    boards.sideboard.cards = { s: forest };
    boards.companions.cards = { c: forest };
    const deck = parseDeck(json, SLIMEFOOT);
    expect(deck.cards.map((c) => c.board)).toEqual([
      'commander',
      'companion',
      'main',
      'main',
      'main',
      'main',
      'main',
      'main',
      'side',
    ]);
  });

  it('counts a companion also in the sideboard once, as an import does', () => {
    const deck = parseDeck(deckFixture(COMPANION), COMPANION);
    const lurrus = deck.cards.filter(
      (c) => c.name === 'Lurrus of the Dream-Den'
    );
    expect(lurrus.map((c) => `${c.board} ${c.qty}`)).toEqual([
      'companion 1',
      'side 2',
    ]);
    const { write, notes } = toDeckWrite(deck, {
      byId: () => [],
      byName: (key) =>
        key === nameKey('Lurrus of the Dream-Den')
          ? [printing(SIGNET_CMR, 'Lurrus of the Dream-Den', 'iko', '226')]
          : [],
    });
    expect(write.format).toBe('constructed');
    expect(write.cards).toEqual([
      { printingId: SIGNET_CMR, qty: 1, board: 'companion' },
      { printingId: SIGNET_CMR, qty: 1, board: 'side' },
    ]);
    expect(notes).toEqual([
      expect.stringContaining(
        '"Lurrus of the Dream-Den" is listed as the companion'
      ),
    ]);
    // The parsed deck itself is left as Moxfield sent it.
    expect(deck.cards.find((c) => c.board === 'side')?.qty).toBe(2);
  });

  it("puts an Oathbreaker's signature spell on the commander board", () => {
    const json = deckFixture(SLIMEFOOT);
    const boards = json.boards as Record<string, { cards: object }>;
    const bog = Object.values(boards.mainboard.cards)[5] as object;
    boards.signatureSpells = { cards: { s: bog } };
    const deck = parseDeck(json, SLIMEFOOT);
    expect(
      deck.cards.filter((c) => c.board === 'commander').map((c) => c.name)
    ).toEqual(['Slimefoot, the Stowaway', 'Bojuka Bog']);
  });
});
