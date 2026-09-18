import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

// A local stand-in for Scryfall: the bulk-data endpoint and a small real
// bulk file, so the full download -> ingest -> swap path runs offline.
const fixture = readFileSync(
  path.join(
    __dirname,
    '../src/main/cardData/fixtures/default-cards.sample.jsonl.gz'
  )
);
const FIXTURE_CARDS = 39;

test.describe.configure({ mode: 'serial' });

let server: Server;
let app: ElectronApplication;
let userDataDir: string;
const bulkRequests: { url?: string; userAgent?: string }[] = [];
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
  server = createServer((req, res) => {
    const { port } = server.address() as AddressInfo;
    if (req.url === '/bulk-data/default-cards') {
      bulkRequests.push({ url: req.url, userAgent: req.headers['user-agent'] });
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          object: 'bulk_data',
          type: 'default_cards',
          updated_at: '2026-09-18T09:05:32.127+00:00',
          jsonl_download_uri: `http://127.0.0.1:${port}/cards.jsonl.gz`,
          compressed_size: fixture.length,
        })
      );
    } else if (req.url === '/cards.jsonl.gz') {
      res.setHeader('Content-Length', fixture.length);
      res.end(fixture);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-data-'));
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_BULK_DATA_URL: `http://127.0.0.1:${port}/bulk-data/default-cards`,
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
  server?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('first launch downloads and ingests card data', async () => {
  const page = await appWindow();
  const status = page.getByTestId('card-data-status');

  await expect(status).toHaveAttribute('data-phase', 'idle');
  await expect(status).toContainText(`(${FIXTURE_CARDS} cards)`);
  await expect(status).toContainText('Card data from Sep 18, 2026');
  expect(bulkRequests[0]?.userAgent).toMatch(/^MTGPlayMat\/\d/);

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
  expect(bulkRequests).toHaveLength(2);
});

test('collection search works on the new data', async () => {
  const page = await appWindow();
  await page.getByText('Collection').first().click();

  await page.getByLabel('Card name').fill('llanowar');
  await page.getByLabel('Card name').press('Enter');
  const tiles = page.locator('img[alt="Llanowar Elves"]');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first()).toHaveAttribute(
    'src',
    /^card:\/\/[0-9a-f-]+\/0\/normal$/
  );
  await expect(page.locator('i.ss.ss-dom')).toHaveCount(1);

  const sets = await page.evaluate(() => window.api.listSets());
  expect(sets.map((s) => s.code)).toContain('m21');
});

test('an imported deck resolves printings and plays', async () => {
  const page = await appWindow();
  const decks = await page.evaluate(() =>
    window.api.importDeck({
      name: 'Fixture deck',
      deckList: '4 Llanowar Elves (DOM)\n2 Delver of Secrets\n1 Not A Card',
    })
  );
  expect(decks).toHaveLength(1);
  expect(decks[0].displayScryfallId).toMatch(/^[0-9a-f-]{36}$/);

  // Six cards all go into the opening hand, faces filled from the DB.
  await page.evaluate((id) => window.api.startPlayTest(id), decks[0].id);
  const board = app.windows().find((w) => w.url().includes('board.html'))!;
  await expect(board.getByTestId('library')).toHaveAttribute('data-count', '0');
  const hand = await page.evaluate(() => window.api.getHandView());
  expect(hand?.hand).toHaveLength(6);
  const delver = hand?.hand.find((c) => c.ref?.name.startsWith('Delver'));
  expect(delver?.ref?.faces.map((f) => f.name)).toEqual([
    'Delver of Secrets',
    'Insectile Aberration',
  ]);
});

test('no renderer console errors', () => {
  // Card images come from the live Scryfall CDN through the cache.
  expect(errors).toEqual([]);
});
