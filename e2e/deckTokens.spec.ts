import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import type { GameState } from '../src/shared/game';
import { type FakeScryfall, startFakeScryfall } from './fakeScryfall';
import { battlefieldMenuItem } from './gameMenu';

interface TestHooks {
  gameState(): GameState;
}

// A Treasure/Food deck against the fixture card data, so the deck's
// tokens come from Scryfall's related cards rather than a search.
test.describe.configure({ mode: 'serial' });

let scryfall: FakeScryfall;
let app: ElectronApplication;
let userDataDir: string;
let board: Page;
let hand: Page;
let appWindow: Page;
let deckId: number;
const errors: string[] = [];

const windowByPage = async (html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes(html));
  if (!page) throw new Error(`no ${html} window`);
  await page.waitForLoadState('load');
  return page;
};

const gameState = () =>
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.gameState()
  );

const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

const tokens = () =>
  board.getByTestId('battlefield').locator('[data-token="true"]');

const tokenNamed = (name: string) =>
  board
    .getByTestId('battlefield')
    .locator(`[data-token="true"][data-card-name="${name}"]`);

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-tokens-'));
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: false })
  );
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_BULK_DATA_URL: scryfall.bulkDataUrl,
    },
  });
  const watch = (page: Page) => {
    const label = () => page.url().split('/').pop();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`${label()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`${label()}: ${err.message}`));
  };
  app.windows().forEach(watch);
  app.on('window', watch);

  appWindow = await windowByPage('app.html');
  await expect(appWindow.getByTestId('card-data-status')).toContainText(
    'cards)'
  );

  const report = await appWindow.evaluate(() =>
    window.api.previewDeckImport(
      "20 Tireless Provisioner\n1 Elspeth, Sun's Champion"
    )
  );
  expect(report.unresolved).toEqual([]);
  deckId = await appWindow.evaluate(
    (cards) =>
      window.api.createDeck({ name: 'Treasure', format: 'other', cards }),
    report.resolved.map((r) => ({
      printingId: r.printing.id,
      qty: r.qty,
      board: r.board,
    }))
  );
  await appWindow.evaluate((id) => window.api.startPlayTest(id), deckId);
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await hand.getByRole('button', { name: 'Keep' }).click();
});

test.afterAll(async () => {
  await app?.close();
  scryfall?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the token dialog lists the deck's tokens without a search", async () => {
  await (await battlefieldMenuItem(board, 'Create token…')).click();
  const dialog = board.getByRole('dialog', { name: 'Create token' });
  // This board may be on a stream, so the list waits to be asked for.
  await expect(dialog.getByTestId('deck-tokens')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Show this deck’s tokens' }).click();
  const listed = dialog.getByTestId('deck-tokens').getByTestId('token-result');
  // Elspeth's Soldier printing isn't in the fixture, so another Soldier
  // printing stands in for it.
  await expect(listed).toHaveText([
    /Elspeth, Sun's Champion Emblem/,
    /Food/,
    /Soldier/,
    /Treasure/,
  ]);

  await listed.filter({ hasText: 'Treasure' }).click();
  await dialog.getByLabel('How many?').fill('2');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tokenNamed('Treasure')).toHaveCount(2);
  await expect(tokenNamed('Treasure').first().locator('img')).toHaveAttribute(
    'src',
    'card://1728ad2d-c8a6-49e4-85bb-29934fa26208/0/normal'
  );
});

test('a card in hand or on the battlefield creates its own tokens', async () => {
  const provisioner = hand
    .getByTestId('hand')
    .locator('[data-testid="card"][data-card-name="Tireless Provisioner"]')
    .first();
  await provisioner.click({ button: 'right' });
  await menuItem(hand, 'Create Food').click();
  await expect(tokenNamed('Food')).toHaveCount(1);

  await provisioner.click({ button: 'right' });
  await menuItem(hand, 'Play').click();
  const onField = board
    .getByTestId('battlefield')
    .locator('[data-card-name="Tireless Provisioner"]');
  await expect(onField).toHaveCount(1);
  await onField.click({ button: 'right' });
  await expect(menuItem(board, 'Create Food')).toBeVisible();
  await menuItem(board, 'Create Treasure').click();
  await expect(tokenNamed('Treasure')).toHaveCount(3);
});

test('designations are two clicks away and are ordinary cards', async () => {
  const before = await tokens().count();
  await (await battlefieldMenuItem(board, 'Monarch')).click();
  await expect(tokenNamed('The Monarch')).toHaveCount(1);

  await (await battlefieldMenuItem(board, 'Day/Night')).click();
  const day = tokenNamed('Day // Night');
  await expect(day).toHaveCount(1);
  await expect(day).toHaveAttribute('data-face-index', '0');
  await day.click({ button: 'right' });
  await menuItem(board, 'Transform to Night').click();
  await expect(day).toHaveAttribute('data-face-index', '1');

  // The Initiative is the back of the Undercity dungeon card.
  await (await battlefieldMenuItem(board, 'Create token…')).click();
  const dialog = board.getByRole('dialog', { name: 'Create token' });
  await dialog.getByTestId('designation-initiative').click();
  await expect(dialog).toHaveCount(0);
  await expect(tokenNamed('Undercity // The Initiative')).toHaveAttribute(
    'data-face-index',
    '1'
  );
  await expect(tokens()).toHaveCount(before + 3);

  // Peers get the public view, where these are plain cards with art.
  const view = await board.evaluate(() => window.api.getBoardView());
  const monarch = view?.zones.battlefield.find(
    (card) => card.ref?.name === 'The Monarch'
  );
  expect(monarch).toMatchObject({
    isToken: true,
    ref: { id: '40b79918-22a7-4fff-82a6-8ebfe6e87185', typeLine: 'Card' },
  });
  const state = await gameState();
  expect(state.log.at(-1)).toMatchObject({
    type: 'createTokens',
    faceIndex: 1,
  });
});

test("with the hand docked, the deck's tokens show straight away", async () => {
  await appWindow.evaluate(() =>
    window.api.updateSettings({ handInBoard: true })
  );
  await appWindow.evaluate((id) => window.api.startPlayTest(id), deckId);
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('hand.html')))
    .toHaveLength(0);
  board = await windowByPage('board.html');
  const saved = board.getByRole('dialog', { name: 'Restore saved game?' });
  await saved.getByRole('button', { name: 'New game' }).click();
  await expect(board.getByTestId('hand-tray')).toBeVisible();

  await (await battlefieldMenuItem(board, 'Create token…')).click();
  const dialog = board.getByRole('dialog', { name: 'Create token' });
  await expect(
    dialog.getByTestId('deck-tokens').getByTestId('token-result')
  ).toHaveCount(4);
  await expect(
    dialog.getByRole('button', { name: 'Show this deck’s tokens' })
  ).toHaveCount(0);
  await board.keyboard.press('Escape');
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
