import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import {
  type FakeScryfall,
  fixture,
  FIXTURE_CARDS,
  startFakeScryfall,
} from './fakeScryfall';

test.describe.configure({ mode: 'serial' });

let scryfall: FakeScryfall;
let app: ElectronApplication;
let userDataDir: string;
const errors: string[] = [];

const appWindow = async (): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes('app.html')))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes('app.html'))!;
  await page.waitForLoadState('load');
  return page;
};

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-data-'));
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_BULK_DATA_URL: scryfall.bulkDataUrl,
    },
  });
  const watch = (page: Page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
  };
  app.windows().forEach(watch);
  app.on('window', watch);
});

test.afterAll(async () => {
  await app?.close();
  scryfall?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('first launch downloads and ingests card data', async () => {
  const page = await appWindow();
  const status = page.getByTestId('card-data-status');

  await expect(status).toHaveAttribute('data-phase', 'idle');
  await expect(status).toContainText(`(${FIXTURE_CARDS} cards)`);
  await expect(status).toContainText('Card data from Sep 18, 2026');
  expect(scryfall.bulkRequests[0]?.userAgent).toMatch(/^MTGPlayMat\/\d/);

  const result = await page.evaluate(() => window.api.getCardDataStatus());
  expect(result.local?.printings).toBe(FIXTURE_CARDS);
  expect(result.progress).toMatchObject({
    rows: FIXTURE_CARDS,
    bytes: fixture.length,
    totalBytes: fixture.length,
  });
});

test('progress events are pushed during a manual update', async () => {
  const page = await appWindow();
  // Same updated_at as local, so the manual check finds nothing newer.
  const phases = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        const stop = window.api.onCardDataStatus((s) => {
          seen.push(s.phase);
          if (s.phase === 'idle' || s.phase === 'error') {
            stop();
            resolve(seen);
          }
        });
        void window.api.updateCardData();
      })
  );
  expect(phases).toEqual(['checking', 'idle']);
  expect(scryfall.bulkRequests).toHaveLength(2);
});

test('card search works on the new data', async () => {
  const page = await appWindow();

  const found = await page.evaluate(() =>
    window.api.searchCards({ keyword: 'llanowar' })
  );
  expect(found.map((c) => c.name)).toEqual([
    'Llanowar Elves',
    'Llanowar Elves',
  ]);
  expect(found.map((c) => c.setCode).sort()).toEqual(['dom', 'm19']);

  // Name search is what the deck builder uses, and it groups printings.
  const names = await page.evaluate(() =>
    window.api.searchCardNames('llanowar')
  );
  expect(names.map((n) => n.name)).toEqual(['Llanowar Elves']);

  const sets = await page.evaluate(() => window.api.listSets());
  expect(sets.map((s) => s.code)).toContain('m21');
});

test('an imported deck resolves printings and plays', async () => {
  const page = await appWindow();
  const report = await page.evaluate(() =>
    window.api.previewDeckImport(
      '4 Llanowar Elves (DOM)\n2 Delver of Secrets\n1 Not A Card'
    )
  );
  expect(report.resolved.map((r) => r.matchedBy)).toEqual(['name+set', 'name']);
  expect(report.unresolved.map((u) => u.name)).toEqual(['Not A Card']);

  const deckId = await page.evaluate(
    (cards) =>
      window.api.createDeck({ name: 'Fixture deck', format: 'other', cards }),
    report.resolved.map((r) => ({
      printingId: r.printing.id,
      qty: r.qty,
      board: r.board,
    }))
  );
  const decks = await page.evaluate(() => window.api.listDecks());
  expect(decks).toHaveLength(1);
  expect(decks[0].displayPrintingId).toMatch(/^[0-9a-f-]{36}$/);

  // Six cards all go into the opening hand, faces filled from the DB.
  await page.evaluate((id) => window.api.startPlayTest(id), deckId);
  const board = app.windows().find((w) => w.url().includes('board.html'))!;
  await expect(board.getByTestId('library')).toHaveAttribute('data-count', '0');
  const hand = await page.evaluate(() => window.api.getHandView());
  expect(hand?.hand).toHaveLength(6);
  const delver = hand?.hand.find((c) => c.ref?.name.startsWith('Delver'));
  expect(delver?.ref?.faces.map((f) => f.name)).toEqual([
    'Delver of Secrets',
    'Insectile Aberration',
  ]);
  await page.evaluate((id) => window.api.deleteDeck(id), deckId);
});

test('no renderer console errors', () => {
  // Card images come from the live Scryfall CDN through the cache.
  expect(errors).toEqual([]);
});
