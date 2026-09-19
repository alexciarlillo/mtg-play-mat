import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { type FakeScryfall, startFakeScryfall } from './fakeScryfall';

const ELVES_M19 = '73542493-cd0b-4bb7-a5b8-8f889c76e4d6';
const FOREST_M21 = '3279314f-d639-4489-b2ab-3621bb3ca64b';

// The Moxfield fixture plus one line no card database can resolve.
const moxfieldExport = readFileSync(
  path.join(__dirname, '../src/main/decks/fixtures/moxfield-commander.txt'),
  'utf8'
).replace('1 Sol Ring (C21) 263', '1 Sol Ring (C21) 263\n1 Totally Bogus Card');

const mtgaExport = readFileSync(
  path.join(__dirname, '../src/main/decks/fixtures/mtga.txt'),
  'utf8'
);

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

// A deck saved by the previous schema: one row per copy, no boards.
const writeOldDeckDb = (dir: string) => {
  mkdirSync(path.join(dir, 'db'), { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'db', 'Decks.sqlite'));
  db.exec(`
    CREATE TABLE decks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, display_card_id TEXT);
    CREATE TABLE deck_cards (deck_id INTEGER NOT NULL, card_id TEXT NOT NULL);
    CREATE INDEX deck_cards_deck ON deck_cards (deck_id);
    INSERT INTO decks (name, display_card_id) VALUES ('Legacy Elves', '${ELVES_M19}');
    INSERT INTO deck_cards VALUES (1, '${ELVES_M19}'), (1, '${ELVES_M19}'),
      (1, '${FOREST_M21}');
    PRAGMA user_version = 1;
  `);
  db.close();
};

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-decks-'));
  writeOldDeckDb(userDataDir);
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

const tile = (page: Page, name: string) =>
  page.getByTestId('deck-tile').filter({ hasText: name });

test('an old-schema deck survives the migration', async () => {
  const page = await appWindow();
  await expect(page.getByTestId('card-data-status')).toHaveAttribute(
    'data-phase',
    'idle'
  );
  await expect(tile(page, 'Legacy Elves')).toContainText(
    'Constructed · 3 cards'
  );
});

test('Play online picks a deck, starts the game, and hosts', async () => {
  const page = await appWindow();
  await page.getByRole('link', { name: 'Play online' }).first().click();

  const setup = page.getByTestId('game-setup');
  await expect(setup).toHaveAttribute('data-open', 'false');
  await page.getByLabel('Deck', { exact: true }).selectOption({
    label: 'Legacy Elves (3 cards)',
  });
  await page.getByRole('button', { name: 'Start game' }).click();

  await expect(setup).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('game-status')).toHaveText(
    'Game open with Legacy Elves.'
  );
  await expect
    .poll(() => app.windows().some((w) => w.url().includes('board.html')))
    .toBe(true);
  const view = await page.evaluate(() => window.api.getHandView());
  expect(view?.hand.map((c) => c.ref?.name).sort()).toEqual([
    'Forest',
    'Llanowar Elves',
    'Llanowar Elves',
  ]);

  // With a game open, hosting goes straight to the invite, no nudge.
  await page.getByRole('button', { name: 'Host a game' }).click();
  await expect(page.getByLabel('Invite code for seat 2')).toHaveValue(
    /^MPM1:/,
    { timeout: 15_000 }
  );
  await expect(page.getByTestId('no-game-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Close game' }).click();
  await page
    .getByRole('dialog', { name: 'Close game?' })
    .getByRole('button', { name: 'Close game' })
    .click();
  await expect(setup).toHaveAttribute('data-open', 'false');
  await expect
    .poll(() => app.windows().filter((w) => !w.url().includes('net.html')))
    .toHaveLength(1);

  await page.getByRole('link', { name: 'Deck Builder' }).first().click();
});

test('import a Moxfield Commander export, skipping a bogus line', async () => {
  const page = await appWindow();
  await page.getByRole('button', { name: 'Import a deck' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Atraxa Test');
  await page.getByLabel('Card list').fill(moxfieldExport);
  await page.getByRole('button', { name: 'Check list' }).click();

  const report = page.getByTestId('import-report');
  await expect(page.getByTestId('import-summary')).toHaveText(
    '13 resolved, 1 unresolved, 2 ignored'
  );
  await expect(report).toContainText('Skipped 2 maybeboard line(s).');
  const bogus = page.getByTestId('unresolved-line');
  await expect(bogus).toHaveCount(1);
  await expect(bogus).toContainText('Totally Bogus Card');
  await expect(bogus).toContainText('No card named "Totally Bogus Card"');
  await expect(page.getByLabel('Format')).toHaveValue('commander');

  // Nothing is saved until every unresolved line is fixed or skipped.
  const save = page.getByRole('button', { name: 'Save deck' });
  await expect(save).toBeDisabled();
  await bogus.getByRole('button', { name: 'Skip' }).click();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByTestId('import-report')).toHaveCount(0);
  await expect(tile(page, 'Atraxa Test')).toContainText('Commander · 31 cards');
  await expect(tile(page, 'Atraxa Test').locator('img')).toHaveAttribute(
    'src',
    /^card:\/\/[0-9a-f-]+\/0\/normal$/
  );
});

test('import an MTGA export with About name and blank-line sideboard', async () => {
  const page = await appWindow();
  await page.getByRole('button', { name: 'Import a deck' }).click();
  await page.getByLabel('Card list').fill(mtgaExport);
  await page.getByRole('button', { name: 'Check list' }).click();

  await expect(page.getByTestId('import-summary')).toHaveText(
    '12 resolved, 0 unresolved, 0 ignored'
  );
  await expect(page.getByTestId('import-report')).toContainText(
    'Main: 60 · Sideboard: 5'
  );
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Mono-White Angels'
  );
  await expect(page.getByLabel('Format')).toHaveValue('constructed');
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(tile(page, 'Mono-White Angels')).toContainText(
    'Constructed · 60 cards'
  );
});

test('the editor groups cards and switches a printing that persists', async () => {
  const page = await appWindow();
  await tile(page, 'Atraxa Test').click();

  const commander = page.getByTestId('board-commander');
  await expect(commander).toContainText('Commander (1)');
  await expect(commander).toContainText("Atraxa, Praetors' Voice");
  const main = page.getByTestId('board-main');
  await expect(main).toContainText('Main (30)');
  await expect(main).toContainText('Creature (5)');
  await expect(main).toContainText('Land (21)');

  const elves = page.locator(
    '[data-testid="deck-card"][data-card-name="Llanowar Elves"]'
  );
  await expect(elves.getByTestId('printing-button')).toHaveText('M19 #314');
  await elves.getByTestId('printing-button').click();

  const options = page.getByTestId('printing-option');
  await expect(options).toHaveCount(2);
  await page.getByRole('button', { name: 'Dominaria #168' }).click();
  await expect(elves.getByTestId('printing-button')).toHaveText('DOM #168');

  await page.reload();
  await expect(
    page
      .locator('[data-testid="deck-card"][data-card-name="Llanowar Elves"]')
      .getByTestId('printing-button')
  ).toHaveText('DOM #168');
});

test('the editor edits quantities, boards, name, and exports', async () => {
  const page = await appWindow();
  const row = (name: string) =>
    page.locator(`[data-testid="deck-card"][data-card-name="${name}"]`);

  await page.getByRole('button', { name: 'One more Lightning Bolt' }).click();
  await expect(page.getByLabel('Quantity of Lightning Bolt')).toHaveValue('2');
  await page.getByRole('button', { name: 'One fewer Lightning Bolt' }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('31 cards');

  await page
    .getByLabel('Move Counterspell', { exact: true })
    .selectOption('side');
  await expect(row('Counterspell')).toHaveAttribute('data-board', 'side');
  await expect(page.getByTestId('board-side')).toContainText('Sideboard (1)');

  await page.getByLabel('Add card', { exact: true }).fill('grizzly');
  await page.getByRole('option', { name: /Grizzly Bears/ }).click();
  await expect(row('Grizzly Bears')).toHaveAttribute('data-board', 'main');
  await page.getByRole('button', { name: 'Remove Grizzly Bears' }).click();
  await expect(row('Grizzly Bears')).toHaveCount(0);
  await page
    .getByLabel('Move Counterspell', { exact: true })
    .selectOption('main');

  await page.getByLabel('Deck name', { exact: true }).fill('Atraxa Renamed');
  await page.getByLabel('Deck name', { exact: true }).press('Enter');

  await page.bringToFront();
  await page.getByRole('button', { name: 'Copy MTGA' }).click();
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(text).toMatch(/^Commander\n1 Atraxa, Praetors' Voice \(C16\) 28\n/);
  expect(text).toContain('1 Llanowar Elves (DOM) 168');
  expect(text).toContain('1 Delver of Secrets (ISD) 51');

  const saved = await page.evaluate(() => window.api.listDecks());
  expect(saved.map((d) => d.name)).toContain('Atraxa Renamed');
});

test('a play test uses the main board and puts the commander in command', async () => {
  const page = await appWindow();
  await page.getByRole('button', { name: 'Play test' }).click();

  await expect
    .poll(() => app.windows().some((w) => w.url().includes('board.html')))
    .toBe(true);
  const board = app.windows().find((w) => w.url().includes('board.html'))!;
  // 30 main-board cards, less the opening hand of seven.
  await expect(board.getByTestId('library')).toHaveAttribute(
    'data-count',
    '23'
  );
  const view = await page.evaluate(() => window.api.getHandView());
  expect(view?.hand).toHaveLength(7);
  expect(view?.libraryCount).toBe(23);
  expect(view?.zones.command.map((c) => c.ref?.name)).toEqual([
    "Atraxa, Praetors' Voice",
  ]);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
