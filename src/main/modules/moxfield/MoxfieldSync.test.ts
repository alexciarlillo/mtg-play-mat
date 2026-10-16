// @vitest-environment node
import type { MoxfieldSyncStatus } from '@shared/moxfield';
import { defaultSettings, type Settings } from '@shared/settings';
import type {
  DeckCardEdit,
  DeckDetail,
  DeckPatch,
  DeckSummary,
  NewDeck,
} from '@shared/types/decks';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPANION,
  deckFixture,
  readFixture,
  SATORU,
  SLIMEFOOT,
} from '../../moxfield/fixtures';
import {
  MoxfieldError,
  type MoxfieldSearchPage,
  parseDeck,
  parseSearchPage,
} from '../../moxfield/moxfieldApi';
import type { MoxfieldClient } from '../../moxfield/moxfieldClient';
import type CardDB from '../../shared/db/CardDB';
import type { PrintingCandidate } from '../../shared/db/CardDB';
import DeckDB from '../../shared/db/DeckDB';
import createDeckHandlers from '../decks/deckHandlers';
import type SettingsStore from '../settings/SettingsStore';
import MoxfieldSync from './MoxfieldSync';

const SATORU_NEO = '8887f26d-b097-4fbc-9c48-bdc656409a32';
const ISLAND_CLB = 'c9c9ea23-93c5-4aae-9786-3b3c03a07778';
const SLIMEFOOT_DOM = 'e8815cd9-7032-445a-aebc-cfc19bd51ee4';
const FOREST_CLB = '2b86b3a4-981e-497a-b78b-30b2dbc5ea7a';
const known = new Set([SATORU_NEO, ISLAND_CLB, SLIMEFOOT_DOM, FOREST_CLB]);

// Knows a few of the fixture printings by id, and nothing by name.
const cardDb = {
  available: true,
  summariesByIds: (ids: string[]) =>
    ids
      .filter((id) => known.has(id))
      .map((id) => ({ id }) as PrintingCandidate),
  candidatesByName: () => [],
} as unknown as CardDB & { available: boolean };

const opened: DeckDB[] = [];
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  cardDb.available = true;
});

// Moxfield as the fixtures describe it; a test changes it between syncs.
const upstream = () => {
  const search = readFixture('search');
  const decks = new Map([
    [SATORU, deckFixture(SATORU)],
    [SLIMEFOOT, deckFixture(SLIMEFOOT)],
  ]);
  const client = {
    searchPage: vi.fn(
      async (user: string, _page: number, _signal: AbortSignal) =>
        parseSearchPage(search, user)
    ),
    getDeck: vi.fn(async (id: string) => {
      const json = decks.get(id);
      if (!json) throw new MoxfieldError('notFound', 'gone');
      return parseDeck(json, id);
    }),
  } satisfies MoxfieldClient;
  return { search, decks, client };
};

const setup = (client: MoxfieldClient, user = '') => {
  const deckDb = new DeckDB(':memory:');
  opened.push(deckDb);
  let settings: Settings = { ...defaultSettings, moxfieldUser: user };
  const settingsStore = {
    get settings() {
      return settings;
    },
    update: vi.fn((patch: Partial<Settings>) => {
      settings = { ...settings, ...patch };
      return settings;
    }),
  } as unknown as SettingsStore;
  const statuses: MoxfieldSyncStatus[] = [];
  const cardsChanged = vi.fn();
  const openExternal = vi.fn(async () => undefined);
  let clock = 0;
  const sync = new MoxfieldSync({
    client,
    cardDb,
    deckDb,
    settings: settingsStore,
    onStatus: (s) => statuses.push(s),
    cardsChanged,
    openExternal,
    pauseMs: 0,
    now: () => `2026-10-15T10:00:0${(clock += 1)}.000Z`,
  });
  // The deck handlers answer synchronously; the casts say so.
  const handlers = createDeckHandlers({ cardDb, deckDb });
  const decks = {
    listDecks: () => handlers.listDecks() as DeckSummary[],
    getDeck: (id: number) => handlers.getDeck(id) as DeckDetail | null,
    createDeck: (deck: NewDeck) => handlers.createDeck(deck) as number,
    copyDeck: (id: number) => handlers.copyDeck(id) as number,
    updateDeck: (id: number, patch: DeckPatch) =>
      handlers.updateDeck(id, patch) as DeckDetail | null,
    editDeckCards: (id: number, edit: DeckCardEdit) =>
      handlers.editDeckCards(id, edit) as DeckDetail | null,
  };
  return {
    sync,
    deckDb,
    settingsStore,
    statuses,
    cardsChanged,
    openExternal,
    decks,
  };
};

describe('MoxfieldSync', () => {
  it("adds a user's public decks, read-only and labelled", async () => {
    const { client } = upstream();
    const t = setup(client);
    await t.sync.sync('https://moxfield.com/users/aciarlillo');

    expect(t.settingsStore.update).toHaveBeenCalledWith({
      moxfieldUser: 'aciarlillo',
    });
    const { status } = t.sync;
    expect(status).toMatchObject({
      user: 'aciarlillo',
      running: false,
      error: null,
      lastSyncedAt: '2026-10-15T10:00:01.000Z',
    });
    expect(status.result?.counts).toEqual({
      added: 2,
      updated: 0,
      unchanged: 0,
      gone: 0,
      failed: 0,
    });
    const satoru = status.result!.decks.find((d) => d.publicId === SATORU)!;
    // The fake card database knows only two of its printings.
    expect(satoru.unresolved.map((c) => c.name)).toEqual([
      'Swamp',
      'Temple of Deceit',
      'Arcane Signet',
      'Command Tower',
      'Arcane Denial',
    ]);
    expect(t.statuses.some((s) => s.running && s.progress?.total === 2)).toBe(
      true
    );

    const list = t.decks.listDecks();
    expect(list.map((d) => [d.name, d.format, d.cardCount])).toEqual(
      expect.arrayContaining([
        ['Satoru Home Wrecker', 'commander', 8],
        ['Slimefoot Aristocrats', 'commander', 8],
      ])
    );
    const deck = list.find((d) => d.name === 'Satoru Home Wrecker')!;
    expect(deck.moxfield).toEqual({
      publicId: SATORU,
      user: 'aciarlillo',
      author: 'aciarlillo',
      remoteUpdatedAt: '2023-03-13T00:56:39.627Z',
      syncedAt: '2026-10-15T10:00:01.000Z',
      gone: false,
    });
    expect(deck.displayPrintingId).toBe(SATORU_NEO);

    expect(() => t.decks.updateDeck(deck.id, { name: 'Mine' })).toThrow(
      /read-only|Moxfield deck/
    );
    expect(() =>
      t.decks.editDeckCards(deck.id, {
        type: 'setQty',
        printingId: ISLAND_CLB,
        board: 'main',
        qty: 1,
      })
    ).toThrow(/Moxfield deck/);

    await t.sync.handlers.openMoxfieldDeck(deck.id);
    expect(t.openExternal).toHaveBeenCalledWith(
      `https://moxfield.com/decks/${SATORU}`
    );
  });

  it('re-syncs only changed decks, keeps ids, and flags gone ones', async () => {
    const up = upstream();
    const t = setup(up.client);
    await t.sync.sync('aciarlillo');
    const idOf = (publicId: string) =>
      t.decks.listDecks().find((d) => d.moxfield?.publicId === publicId)!.id;
    const satoruId = idOf(SATORU);
    const slimefootId = idOf(SLIMEFOOT);
    up.client.getDeck.mockClear();

    // Satoru changes upstream; Slimefoot goes private.
    const data = up.search.data as Record<string, unknown>[];
    data[0].lastUpdatedAtUtc = '2026-10-01T00:00:00.000Z';
    data.splice(1, 1);
    up.search.totalResults = 1;
    const satoru = up.decks.get(SATORU)!;
    satoru.lastUpdatedAtUtc = '2026-10-01T00:00:00.000Z';
    const boards = satoru.boards as Record<
      string,
      { cards: Record<string, { quantity: number }> }
    >;
    Object.values(boards.mainboard.cards)[0].quantity = 6;

    await t.sync.sync('aciarlillo');
    expect(up.client.getDeck.mock.calls.map((c) => c[0])).toEqual([SATORU]);
    expect(t.sync.status.result?.counts).toMatchObject({
      updated: 1,
      gone: 1,
    });
    expect(idOf(SATORU)).toBe(satoruId);
    expect(t.cardsChanged.mock.calls).toEqual([[satoruId]]);
    const gone = t.decks.getDeck(slimefootId)!;
    expect(gone.moxfield?.gone).toBe(true);
    expect(gone.cards.length).toBeGreaterThan(0);

    // Nothing new upstream: nothing fetched, nothing changed.
    up.client.getDeck.mockClear();
    t.cardsChanged.mockClear();
    await t.sync.sync('aciarlillo');
    expect(up.client.getDeck).not.toHaveBeenCalled();
    expect(t.sync.status.result?.counts).toMatchObject({
      unchanged: 1,
      gone: 1,
    });
    expect(t.cardsChanged).not.toHaveBeenCalled();
  });

  it('never touches local decks when the sync fails', async () => {
    const up = upstream();
    const t = setup(up.client);
    const local = t.decks.createDeck({
      name: 'Local',
      format: 'other',
      cards: [],
    });
    await t.sync.sync('aciarlillo');
    const before = JSON.stringify(t.decks.listDecks());

    up.search.data = [];
    up.client.getDeck.mockRejectedValue(
      new MoxfieldError('blocked', 'Moxfield refused the request.')
    );
    (up.search.data as unknown[]).push(
      ...(readFixture('search').data as Record<string, unknown>[]).map((d) => ({
        ...d,
        lastUpdatedAtUtc: '2026-10-02T00:00:00.000Z',
      }))
    );
    await t.sync.sync('aciarlillo');
    expect(t.sync.status.error).toBe('Moxfield refused the request.');
    // The previous result stays on show.
    expect(t.sync.status.result?.counts.added).toBe(2);
    expect(JSON.stringify(t.decks.listDecks())).toBe(before);
    expect(t.decks.getDeck(local)?.moxfield).toBeNull();
  });

  it('refuses an unknown user without changing anything', async () => {
    const { client } = upstream();
    client.searchPage.mockImplementation(async (user) =>
      parseSearchPage(readFixture('search-unknown-user'), user)
    );
    const t = setup(client);
    await t.sync.sync('no-such-user');
    expect(t.sync.status.error).toMatch(/no public decks by "no-such-user"/);
    expect(t.decks.listDecks()).toEqual([]);
  });

  it('refuses input that is not a username', async () => {
    const { client } = upstream();
    const t = setup(client);
    expect(t.sync.sync('https://example.com/users/x')).toBeNull();
    expect(t.sync.status.error).toMatch(/Enter a Moxfield username/);
    expect(client.searchPage).not.toHaveBeenCalled();
    expect(t.settingsStore.update).not.toHaveBeenCalled();
  });

  it('waits for card data', async () => {
    const { client } = upstream();
    const t = setup(client);
    cardDb.available = false;
    await t.sync.sync('aciarlillo');
    expect(t.sync.status.error).toMatch(/Card data is not ready/);
    expect(client.searchPage).not.toHaveBeenCalled();
  });

  it('runs one sync at a time, and can be cancelled', async () => {
    const { client } = upstream();
    let release: () => void = () => undefined;
    client.searchPage.mockImplementation(
      (user: string, _page: number, signal: AbortSignal) =>
        new Promise<MoxfieldSearchPage>((resolve, reject) => {
          release = () => resolve(parseSearchPage(readFixture('search'), user));
          signal.addEventListener('abort', () =>
            reject(new MoxfieldError('cancelled', 'The sync was cancelled.'))
          );
        })
    );
    const t = setup(client);
    const run = t.sync.sync('aciarlillo')!;
    expect(t.sync.status.running).toBe(true);
    expect(t.sync.sync('aciarlillo')).toBeNull();
    expect(client.searchPage).toHaveBeenCalledTimes(1);
    t.sync.handlers.cancelMoxfieldSync();
    await run;
    expect(t.sync.status).toMatchObject({
      running: false,
      error: 'The sync was cancelled.',
    });
    expect(t.decks.listDecks()).toEqual([]);
    release();
  });

  it('remembers when the saved user last synced', async () => {
    const { client } = upstream();
    const t = setup(client);
    await t.sync.sync('aciarlillo');
    const again = new MoxfieldSync({
      client,
      cardDb,
      deckDb: t.deckDb,
      settings: t.settingsStore,
      onStatus: () => undefined,
      openExternal: async () => undefined,
    });
    expect(again.status).toMatchObject({
      user: 'aciarlillo',
      lastSyncedAt: '2026-10-15T10:00:01.000Z',
      result: null,
    });
  });

  it('remembers the last sync of a user with no public decks', async () => {
    const { client, search } = upstream();
    search.data = [];
    search.totalResults = 0;
    const t = setup(client);
    await t.sync.sync('aciarlillo');
    expect(t.sync.status.result?.complete).toBe(true);
    const again = new MoxfieldSync({
      client,
      cardDb,
      deckDb: t.deckDb,
      settings: t.settingsStore,
      onStatus: () => undefined,
      openExternal: async () => undefined,
    });
    expect(again.status.lastSyncedAt).toBe('2026-10-15T10:00:01.000Z');
  });

  it('flags nothing gone, and says so, when the list moved mid-sync', async () => {
    const up = upstream();
    const t = setup(up.client);
    await t.sync.sync('aciarlillo');
    // One deck missing, yet the count still says two.
    (up.search.data as unknown[]).splice(1, 1);
    await t.sync.sync('aciarlillo');
    expect(t.sync.status.result).toMatchObject({
      complete: false,
      counts: { unchanged: 1, gone: 0 },
    });
    expect(t.decks.listDecks().every((d) => !d.moxfield?.gone)).toBe(true);
  });

  it("notes a companion counted once, as a pasted list's would be", async () => {
    const up = upstream();
    up.search.data = [
      {
        ...(readFixture('search').data as object[])[1],
        publicId: COMPANION,
        name: 'Lurrus Value',
      },
    ];
    up.search.totalResults = 1;
    up.decks.set(COMPANION, deckFixture(COMPANION));
    const t = setup(up.client);
    await t.sync.sync('aciarlillo');
    expect(t.sync.status.result?.decks[0].notes).toEqual([
      expect.stringContaining('counted once'),
    ]);
  });

  it('copies a synced deck into an editable local one', async () => {
    const { client } = upstream();
    const t = setup(client);
    await t.sync.sync('aciarlillo');
    const synced = t.decks.listDecks()[0];
    const copyId = t.decks.copyDeck(synced.id);
    const copy = t.decks.getDeck(copyId)!;
    expect(copy).toMatchObject({
      name: `${synced.name} (copy)`,
      moxfield: null,
      cardCount: synced.cardCount,
    });
    expect(t.decks.updateDeck(copyId, { name: 'Mine' })?.name).toBe('Mine');
    expect(() => t.decks.copyDeck(9999)).toThrow(/invalid id/);
  });
});
