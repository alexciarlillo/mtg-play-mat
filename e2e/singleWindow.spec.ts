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
import { clickGameMenu } from './gameMenu';

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
}

type Hooks = { testHooks: TestHooks };

// One app instance; later steps build on the game earlier ones left.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let userDataDir: string;
let appPage: Page;
let board: Page;
const errors: string[] = [];

const windowUrls = () => app.windows().map((w) => w.url());

const windowByPage = async (html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes(html));
  if (!page) throw new Error(`no ${html} window`);
  await page.waitForLoadState('load');
  return page;
};

const openSample = (seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(s),
    seed
  );

const gameState = () =>
  app.evaluate(() => (globalThis as unknown as Hooks).testHooks.gameState());

const me = (state: GameState) => state.players[0];

const tray = () => board.getByTestId('hand-tray');
const handCards = () => tray().getByTestId('hand').getByTestId('card');
const fieldCards = () => board.getByTestId('battlefield').getByTestId('card');
const pile = (testId: string) => board.getByTestId(testId);
const menuItem = (name: string) =>
  board.getByRole('menuitem', { name, exact: true });
const center = (box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

// Drags from the middle of one element to a point, as a user would.
const dragTo = async (
  from: ReturnType<Page['locator']>,
  to: { x: number; y: number }
) => {
  const box = await from.boundingBox();
  if (!box) throw new Error('nothing to drag');
  const start = center(box);
  await board.mouse.move(start.x, start.y);
  await board.mouse.down();
  await board.mouse.move(start.x + 20, start.y - 20, { steps: 5 });
  await board.mouse.move(to.x, to.y, { steps: 10 });
  await board.mouse.up();
  return start;
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-single-'));
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: true })
  );
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1' },
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

  appPage = await windowByPage('app.html');
  await openSample(20260919);
  board = await windowByPage('board.html');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('only the board opens, with the hand docked in it', async () => {
  await expect(handCards()).toHaveCount(7);
  expect(windowUrls().filter((url) => url.includes('hand.html'))).toEqual([]);
  expect(windowUrls()).toHaveLength(2);

  // Hosting the hand, the board may read the private view and library.
  const hand = await board.evaluate(() => window.api.getHandView());
  expect(hand?.hand).toHaveLength(7);
  const library = await board.evaluate(() => window.api.getLibrary());
  expect(library).toHaveLength(53);
  const status = await appPage.evaluate(() => window.api.getPlayTestStatus());
  expect(status.handInBoard).toBe(true);
});

test('mulligan, then keep and bottom a card, from the tray', async () => {
  const status = board.getByTestId('mulligan-status');
  const first = await handCards().evaluateAll((els) =>
    els.map((el) => el.dataset.instanceId)
  );

  await tray().getByRole('button', { name: 'Mulligan' }).click();
  await expect(status).toHaveText(/Mulligans 1/);
  await expect(handCards()).toHaveCount(7);
  expect(
    await handCards().evaluateAll((els) =>
      els.map((el) => el.dataset.instanceId)
    )
  ).not.toEqual(first);

  await tray().getByRole('button', { name: 'Keep' }).click();
  await handCards().first().click();
  await tray().getByRole('button', { name: 'Bottom and keep' }).click();
  await expect(tray().getByTestId('mulligan-bar')).toHaveCount(0);
  await expect(status).toHaveCount(0);
  await expect(handCards()).toHaveCount(6);
  await expect(pile('library')).toHaveAttribute('data-count', '54');
});

test('draw with a key and click a card to play it', async () => {
  await board.keyboard.press('d');
  await expect(handCards()).toHaveCount(7);
  await expect(pile('hand-count')).toHaveAttribute('data-count', '7');

  await handCards().first().click();
  await expect(fieldCards()).toHaveCount(1);
  await expect(handCards()).toHaveCount(6);
});

test('a card dragged from the tray lands where it is dropped', async () => {
  const card = handCards().first();
  const id = await card.getAttribute('data-instance-id');
  const field = await board.getByTestId('battlefield').boundingBox();
  if (!field) throw new Error('no battlefield');
  const drop = { x: field.x + field.width / 2, y: field.y + 150 };

  await dragTo(card, drop);
  const placed = board
    .getByTestId('battlefield')
    .locator(`[data-instance-id="${id}"]`);
  await expect(placed).toHaveCount(1);
  await expect(board.getByTestId('hand-drag-ghost')).toHaveCount(0);
  await expect(handCards()).toHaveCount(5);
  // The point it was grabbed by, its middle, is under the drop point.
  const box = await placed.boundingBox();
  if (!box) throw new Error('no placed card');
  expect(Math.abs(center(box).x - drop.x)).toBeLessThan(3);
  expect(Math.abs(center(box).y - drop.y)).toBeLessThan(3);
  expect((await gameState()).cards[id!].zone).toBe('battlefield');
});

test('dragging onto a pile moves the card; onto the tray keeps it', async () => {
  const graveyard = await pile('graveyard').boundingBox();
  if (!graveyard) throw new Error('no graveyard');
  await dragTo(handCards().first(), center(graveyard));
  await expect(pile('graveyard')).toHaveAttribute('data-count', '1');
  await expect(handCards()).toHaveCount(4);

  const trayBox = await tray().boundingBox();
  if (!trayBox) throw new Error('no tray');
  await dragTo(handCards().first(), {
    x: trayBox.x + trayBox.width - 40,
    y: trayBox.y + trayBox.height / 2,
  });
  await expect(handCards()).toHaveCount(4);
  await expect(pile('graveyard')).toHaveAttribute('data-count', '1');

  // A battlefield card dragged onto the tray goes back to hand.
  const onField = board.getByTestId('battlefield-card').first();
  await dragTo(onField, {
    x: trayBox.x + trayBox.width / 2,
    y: trayBox.y + trayBox.height / 2,
  });
  await expect(handCards()).toHaveCount(5);
});

test('play face down, peek at it in the tray, and reveal the hand', async () => {
  const card = handCards().first();
  const id = await card.getAttribute('data-instance-id');
  const name = await card.getAttribute('data-card-name');
  await card.click({ button: 'right' });
  await menuItem('Play face down').click();

  const face = board
    .getByTestId('battlefield')
    .locator(`[data-instance-id="${id}"]`);
  await expect(face).toHaveCount(1);
  await expect(face).not.toHaveAttribute('data-card-name', name!);
  const peek = tray().getByTestId('face-down-peek');
  await expect(peek.locator(`[data-instance-id="${id}"]`)).toHaveAttribute(
    'data-card-name',
    name!
  );

  const reveal = board.getByTestId('reveal-panel');
  await tray().getByRole('button', { name: 'Reveal hand' }).click();
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('data-source', 'hand');
  await expect(tray().getByTestId('hand-reveal-banner')).toBeVisible();
  await board.keyboard.press('d');
  await expect(reveal).toHaveCount(0);
});

test('search the library for a land from the tray', async () => {
  const before = await handCards().count();
  const activity = pile('library-activity');

  await tray().getByRole('button', { name: 'Search library…' }).click();
  await expect(activity).toHaveAttribute('data-kind', 'search');
  // The board's game keys wait while the dialog is open.
  const libraryCount = await pile('library').getAttribute('data-count');
  await board.keyboard.press('d');
  await expect(pile('library')).toHaveAttribute('data-count', libraryCount!);

  await board.getByLabel('Filter by name or type').fill('land');
  const found = board.getByTestId('search-card');
  await found.first().getByTestId('card').click();
  await board.getByRole('button', { name: 'Move 1 and shuffle' }).click();
  await expect(found).toHaveCount(0);
  await expect(activity).toHaveCount(0);
  await expect(handCards()).toHaveCount(before + 1);
});

test('look at the top two and keep them in order', async () => {
  const [a, b] = me(await gameState()).zones.library;
  await tray().getByRole('button', { name: 'Look at top…' }).click();
  await board.getByLabel('How many cards?').fill('2');
  await board.getByRole('button', { name: 'OK', exact: true }).click();

  const look = board.getByTestId('look-card');
  await expect(look).toHaveCount(2);
  await expect(pile('library-activity')).toHaveAttribute(
    'title',
    'Looking at top 2…'
  );
  expect(
    await look.evaluateAll((els) => els.map((el) => el.dataset.instanceId))
  ).toEqual([a, b]);
  await board.getByRole('button', { name: 'Confirm' }).click();
  await expect(look).toHaveCount(0);
  await expect(pile('library-activity')).toHaveCount(0);
});

test('a new game closes an open search', async () => {
  await tray().getByRole('button', { name: 'Search library…' }).click();
  await expect(board.getByLabel('Filter by name or type')).toBeVisible();
  await openSample(7);
  await expect(board.getByLabel('Filter by name or type')).toHaveCount(0);
  await expect(pile('library-activity')).toHaveCount(0);
  await expect(handCards()).toHaveCount(7);
  await expect(tray().getByTestId('mulligan-bar')).toBeVisible();
});

test('the tray resizes and folds, and the table panel stays above it', async () => {
  const panel = board.getByTestId('table-panel');
  const before = await tray().boundingBox();
  const grip = await board.getByTestId('hand-tray-resize').boundingBox();
  if (!before || !grip) throw new Error('no tray');
  await board.mouse.move(grip.x + 200, grip.y + grip.height / 2);
  await board.mouse.down();
  await board.mouse.move(grip.x + 200, grip.y - 60, { steps: 5 });
  await board.mouse.up();
  await expect
    .poll(async () => (await tray().boundingBox())?.height)
    .toBeGreaterThan(before.height + 50);

  // The panel is clamped to the field, which ends where the tray starts.
  const handle = await board.getByTestId('table-panel-handle').boundingBox();
  if (!handle) throw new Error('no panel handle');
  await board.mouse.move(handle.x + 20, handle.y + handle.height / 2);
  await board.mouse.down();
  await board.mouse.move(handle.x + 20, handle.y + 2000, { steps: 10 });
  await board.mouse.up();
  await expect
    .poll(async () => {
      const [p, t] = await Promise.all([
        panel.boundingBox(),
        tray().boundingBox(),
      ]);
      return p && t ? p.y + p.height <= t.y + 1 : false;
    })
    .toBe(true);

  await tray().getByRole('button', { name: 'Collapse hand' }).click();
  await expect(tray()).toHaveAttribute('data-collapsed', 'true');
  await expect(tray().getByTestId('hand')).toHaveCount(0);
  await tray().getByRole('button', { name: 'Expand hand' }).click();
  await expect(handCards()).toHaveCount(7);
});

test('the Game menu drives the single board', async () => {
  await tray().getByRole('button', { name: 'Keep' }).click();
  await expect(tray().getByTestId('mulligan-bar')).toHaveCount(0);
  expect(await clickGameMenu(app, 'drawMany')).toBe(true);
  const drawMany = board.getByRole('dialog', { name: 'Draw cards' });
  await drawMany.getByLabel('How many?').fill('2');
  await drawMany.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(handCards()).toHaveCount(9);
  await tray().getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(handCards()).toHaveCount(7);
});

test('turning the setting off brings back the hand window next game', async () => {
  await appPage.evaluate(() =>
    window.api.updateSettings({ handInBoard: false })
  );
  // The open game keeps its mode until the next one starts.
  await expect(tray()).toBeVisible();

  await openSample(8);
  const hand = await windowByPage('hand.html');
  board = await windowByPage('board.html');
  await expect(hand.getByTestId('hand').getByTestId('card')).toHaveCount(7);
  await expect(board.getByTestId('hand-tray')).toHaveCount(0);
  expect(windowUrls()).toHaveLength(3);

  // A board that is only shown to others is refused the hidden cards.
  await expect(board.evaluate(() => window.api.getHandView())).rejects.toThrow(
    /untrusted sender/
  );
  await expect(board.evaluate(() => window.api.getLibrary())).rejects.toThrow(
    /untrusted sender/
  );
  expect(await hand.evaluate(() => window.api.getLibrary())).toHaveLength(53);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
