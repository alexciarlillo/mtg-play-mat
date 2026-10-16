import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
  FAKE_USER,
  type FakeDeck,
  type FakeMoxfield,
  startFakeMoxfield,
} from './fakeMoxfield';
import { type FakeScryfall, startFakeScryfall } from './fakeScryfall';

interface TestHooks {
  openedUrls(): string[];
}

const ELVES_ID = 'e2eElvesDeck0000000AAA';
const ATRAXA_ID = 'e2eAtraxaDeck000000BBB';

const elves = (forests: number, updated: string): FakeDeck => ({
  publicId: ELVES_ID,
  name: 'Elf Ball',
  format: 'modern',
  lastUpdatedAtUtc: updated,
  mainboard: [
    // Found by its Scryfall id.
    {
      name: 'Llanowar Elves',
      qty: 4,
      scryfallId: '73542493-cd0b-4bb7-a5b8-8f889c76e4d6',
      set: 'm19',
      cn: '314',
    },
    // An id the card data lacks: found by set and number instead.
    {
      name: 'Forest',
      qty: forests,
      scryfallId: '00000000-0000-4000-8000-000000000000',
      set: 'm21',
      cn: '272',
    },
    { name: 'Totally Bogus Card', qty: 1 },
  ],
  sideboard: [{ name: 'Lightning Bolt', qty: 2 }],
  maybeboard: [{ name: 'Grizzly Bears', qty: 1 }],
});

const atraxa: FakeDeck = {
  publicId: ATRAXA_ID,
  name: 'Superfriends',
  format: 'commander',
  lastUpdatedAtUtc: '2026-09-01T12:00:00.000Z',
  commanders: [{ name: "Atraxa, Praetors' Voice", qty: 1 }],
  mainboard: [
    { name: 'Sol Ring', qty: 1, set: 'c21', cn: '263' },
    { name: 'Command Tower', qty: 1 },
  ],
};

test.describe.configure({ mode: 'serial' });

let scryfall: FakeScryfall;
let moxfield: FakeMoxfield;
let app: ElectronApplication;
let userDataDir: string;
let elvesDeckId: number;
const errors: string[] = [];

const appWindow = async (): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes('app.html')))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes('app.html'))!;
  await page.waitForLoadState('load');
  return page;
};

const openSettings = async () => {
  const page = await appWindow();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  return page;
};

const openDecks = async () => {
  const page = await appWindow();
  await page.getByRole('link', { name: 'Deck Builder' }).first().click();
  return page;
};

// Waits on main's own status: the page shows "not running" both before
// the click lands and after the run, so it can't tell the two apart.
const sync = async (page: Page, user: string) => {
  const asked = moxfield.requests.length;
  await page.getByLabel('Moxfield user').fill(user);
  await page.getByRole('button', { name: 'Sync decks' }).click();
  await expect.poll(() => moxfield.requests.length).toBeGreaterThan(asked);
  await expect
    .poll(async () =>
      page.evaluate(async () => (await window.api.getMoxfieldSync()).running)
    )
    .toBe(false);
  await expect(page.getByTestId('moxfield-status')).toHaveAttribute(
    'data-running',
    'false'
  );
};

const tile = (page: Page, name: string) =>
  page.getByTestId('deck-tile').filter({ hasText: name });

const saveFile = (deckId: number) =>
  path.join(userDataDir, 'saves', `deck-${deckId}.json`);

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  moxfield = await startFakeMoxfield([
    elves(20, '2026-09-01T12:00:00.000Z'),
    atraxa,
  ]);
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-mox-'));
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_BULK_DATA_URL: scryfall.bulkDataUrl,
      MTG_PLAY_MAT_MOXFIELD_URL: moxfield.baseUrl,
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
  moxfield?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("syncs a user's public decks from a profile link", async () => {
  const page = await appWindow();
  await expect(page.getByTestId('card-data-status')).toHaveAttribute(
    'data-phase',
    'idle'
  );
  await page.evaluate(() =>
    window.api.createDeck({ name: 'My Local', format: 'other', cards: [] })
  );

  await openSettings();
  await expect(page.getByTestId('moxfield-status')).toHaveText(
    'Not synced yet.'
  );
  await sync(page, `https://moxfield.com/users/${FAKE_USER}`);
  await expect(page.getByLabel('Moxfield user')).toHaveValue(FAKE_USER);
  await expect(page.getByTestId('moxfield-status')).toContainText(
    'Last synced'
  );
  await expect(page.getByTestId('moxfield-result')).toContainText(
    '2 added · 0 updated · 0 unchanged · 0 no longer on Moxfield · 0 failed'
  );
  await expect(page.getByTestId('moxfield-result-line')).toHaveText(
    /Elf Ball: added, without 1 Totally Bogus Card/
  );
  // The search, then each deck; never the live site.
  expect(moxfield.requests).toEqual([
    expect.stringContaining(`/v2/decks/search?authorUserNames=${FAKE_USER}`),
    `/v3/decks/all/${ELVES_ID}`,
    `/v3/decks/all/${ATRAXA_ID}`,
  ]);
});

test('labels synced decks and filters them apart from local ones', async () => {
  const page = await openDecks();
  await expect(page.getByTestId('deck-tile')).toHaveCount(3);
  await expect(tile(page, 'Elf Ball')).toContainText('Constructed · 24 cards');
  await expect(
    tile(page, 'Elf Ball').getByTestId('moxfield-badge')
  ).toBeVisible();
  await expect(tile(page, 'Superfriends')).toContainText('Commander · 3 cards');
  await expect(
    tile(page, 'My Local').getByTestId('moxfield-badge')
  ).toHaveCount(0);

  // A deck still on Moxfield can't be removed: it would only come back.
  await tile(page, 'Elf Ball').click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText([
    'Open on Moxfield',
    'Make a local copy',
  ]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Moxfield' }).click();
  await expect(page.getByTestId('deck-tile')).toHaveCount(2);
  await page.getByRole('radio', { name: 'Local' }).click();
  await expect(page.getByTestId('deck-tile')).toHaveText([/My Local/]);
  await page.getByRole('radio', { name: 'All' }).click();
  await expect(page.getByTestId('deck-tile')).toHaveCount(3);
});

test('a synced deck is read-only, opens on Moxfield, and can be copied', async () => {
  const page = await openDecks();
  await tile(page, 'Elf Ball').click();
  await expect(page.getByTestId('moxfield-panel')).toContainText(
    `By ${FAKE_USER}`
  );
  elvesDeckId = Number(/decks\/(\d+)/.exec(page.url())![1]);
  // Shown as text: there is no field to try editing.
  await expect(page.getByTestId('deck-title')).toHaveText('Elf Ball');
  await expect(page.getByTestId('deck-format')).toHaveText('Constructed');
  await expect(page.getByLabel('Deck name')).toHaveCount(0);
  await expect(page.getByLabel('Format')).toHaveCount(0);
  await expect(page.getByLabel('Add card')).toBeHidden();
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByTestId('board-side')).toContainText('Sideboard (2)');
  await expect(page.getByTestId('board-main')).toContainText('Main (24)');

  await page.getByRole('button', { name: 'Open on Moxfield' }).click();
  await expect
    .poll(() =>
      app.evaluate(() =>
        (
          globalThis as unknown as { testHooks: TestHooks }
        ).testHooks.openedUrls()
      )
    )
    .toEqual([`https://moxfield.com/decks/${ELVES_ID}`]);

  // Main refuses an edit even if the page were to send one.
  const refused = await page.evaluate(
    (id) =>
      window.api.updateDeck(id, { name: 'Hacked' }).then(
        () => 'saved',
        () => 'refused'
      ),
    elvesDeckId
  );
  expect(refused).toBe('refused');

  await page.getByRole('button', { name: 'Make a local copy' }).click();
  await expect(page.getByLabel('Deck name')).toHaveValue('Elf Ball (copy)');
  await expect(page.getByTestId('moxfield-panel')).toHaveCount(0);
  await expect(page.getByLabel('Add card')).toBeVisible();
  await expect(page.getByTestId('deck-count')).toHaveText('24 cards');
});

test('a re-sync updates changed decks in place and flags gone ones', async () => {
  const page = await appWindow();
  // A game of the synced deck leaves a save behind.
  await page.evaluate((id) => window.api.startPlayTest(id), elvesDeckId);
  await expect.poll(() => existsSync(saveFile(elvesDeckId))).toBe(true);
  await page.evaluate(() => window.api.closePlayTest());

  moxfield.decks = [elves(18, '2026-10-01T12:00:00.000Z')];
  moxfield.requests.length = 0;
  await openSettings();
  await sync(page, FAKE_USER);
  await expect(page.getByTestId('moxfield-result')).toContainText(
    '0 added · 1 updated · 0 unchanged · 1 no longer on Moxfield · 0 failed'
  );
  expect(moxfield.requests.filter((r) => r.startsWith('/v3/'))).toEqual([
    `/v3/decks/all/${ELVES_ID}`,
  ]);
  // Its cards changed, so the old game no longer fits it.
  expect(existsSync(saveFile(elvesDeckId))).toBe(false);

  await openDecks();
  await page.getByRole('radio', { name: 'Moxfield' }).click();
  await expect(tile(page, 'Elf Ball')).toContainText('22 cards');
  await expect(
    tile(page, 'Superfriends').getByTestId('moxfield-gone')
  ).toHaveText('No longer on Moxfield');

  await tile(page, 'Superfriends').click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText([
    'Open on Moxfield',
    'Make a local copy',
    'Remove',
  ]);
  await page.keyboard.press('Escape');

  await tile(page, 'Elf Ball').click();
  expect(page.url()).toContain(`/decks/${elvesDeckId}`);
  await openDecks();
  await tile(page, 'Superfriends').click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('deck-list')).toBeVisible();
  await expect(tile(page, 'Superfriends')).toHaveCount(0);
  await page.getByRole('radio', { name: 'All' }).click();
});

test('a refused or mistyped sync leaves every deck alone', async () => {
  const page = await appWindow();
  const before = await page.evaluate(() => window.api.listDecks());

  await openSettings();
  moxfield.mode = 'blocked';
  await sync(page, FAKE_USER);
  await expect(page.getByRole('alert')).toContainText(
    'Moxfield refused the request (HTTP 403)'
  );
  await expect(page.getByRole('alert')).toContainText(
    'Your decks were not changed.'
  );

  moxfield.mode = 'ok';
  await sync(page, 'no_such_player');
  await expect(page.getByRole('alert')).toContainText(
    'Moxfield has no public decks by "no_such_player"'
  );

  expect(await page.evaluate(() => window.api.listDecks())).toEqual(before);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
