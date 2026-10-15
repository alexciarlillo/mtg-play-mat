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

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
}

type Hooks = { testHooks: TestHooks };

// One app instance; later steps build on the game earlier ones left.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let userDataDir: string;
let board: Page;
let hand: Page;
const errors: string[] = [];
// The creatures played onto the battlefield, and the land beside them.
let creatures: string[] = [];
let land = '';

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
  app.evaluate(() => (globalThis as unknown as Hooks).testHooks.gameState());

const me = (state: GameState) => state.players[0];
const typeOf = (state: GameState, id: string) =>
  state.cards[id].ref.faces[0]?.typeLine ?? state.cards[id].ref.typeLine;
const isCreature = (state: GameState, id: string) =>
  /Creature/.test(typeOf(state, id));
const isLand = (state: GameState, id: string) => /Land/.test(typeOf(state, id));

const lines = () => board.getByTestId('log-entry');
const handCard = (id: string) =>
  hand
    .getByTestId('hand')
    .getByTestId('card')
    .and(hand.locator(`[data-instance-id="${id}"]`));
const fieldCard = (id: string) =>
  board
    .getByTestId('battlefield')
    .locator(`[data-testid="card"][data-instance-id="${id}"]`);
const selected = () =>
  board.locator('[data-testid="battlefield-card"][data-selected]');
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

// Waits for exactly one more action, and returns the state after it.
const oneAction = async (before: GameState, type: string) => {
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length + 1);
  const after = await gameState();
  expect(after.log.at(-1)?.type).toBe(type);
  return after;
};

const undoTo = async (state: GameState) => {
  await hand.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(state.log.length);
  const undone = await gameState();
  expect(undone.players).toEqual(state.players);
  expect(undone.cards).toEqual(state.cards);
};

// A point near a card's top-left corner, which the cards played after it
// (cascaded down and right) leave uncovered.
const cornerOf = async (id: string) => {
  const box = await fieldCard(id).boundingBox();
  if (!box) throw new Error(`no card ${id}`);
  return { x: box.x + 8, y: box.y + 8 };
};

const shiftClick = async (id: string) => {
  const at = await cornerOf(id);
  await board.keyboard.down('Shift');
  await board.mouse.click(at.x, at.y);
  await board.keyboard.up('Shift');
};

const dragTo = async (
  from: { x: number; y: number },
  to: { x: number; y: number }
) => {
  await board.mouse.move(from.x, from.y);
  await board.mouse.down();
  await board.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
    steps: 5,
  });
  await board.mouse.move(to.x, to.y, { steps: 5 });
  await board.mouse.up();
};

// Low in the middle of the field area, clear of the cards and of the
// table panel in the bottom-right corner.
const emptySpot = async () => {
  const area = board.getByTestId('battlefield-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('no battlefield');
  return { x: box.x + box.width * 0.5, y: box.y + box.height - 20, box };
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-select-'));
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: false })
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

  await windowByPage('app.html');
  await app.evaluate(() =>
    (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(11)
  );
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);

  // Draw until the hand holds three creatures and a land, then play them.
  let state = await gameState();
  const inHand = (test: (s: GameState, id: string) => boolean) =>
    me(state).zones.hand.filter((id) => test(state, id));
  while (inHand(isCreature).length < 3 || inHand(isLand).length < 1) {
    await board.keyboard.press('d');
    state = await oneAction(state, 'draw');
  }
  land = inHand(isLand)[0];
  creatures = inHand(isCreature).slice(0, 3);
  for (const id of [land, ...creatures]) {
    await handCard(id).click({ button: 'right' });
    await menuItem(hand, 'Play').click();
    state = await oneAction(state, 'moveCard');
  }
  await expect(board.getByTestId('battlefield-card')).toHaveCount(4);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('Shift-click selects three creatures and T taps them in one undo step', async () => {
  for (const id of creatures) await shiftClick(id);
  await expect(selected()).toHaveCount(3);
  // A Shift-click selects; it never taps.
  const before = await gameState();
  expect(creatures.map((id) => before.cards[id].tapped)).toEqual([
    false,
    false,
    false,
  ]);

  const linesBefore = await lines().count();
  const at = await cornerOf(creatures[1]);
  await board.mouse.move(at.x, at.y);
  await board.keyboard.press('t');
  const after = await oneAction(before, 'setTapped');
  expect(creatures.map((id) => after.cards[id].tapped)).toEqual([
    true,
    true,
    true,
  ]);
  expect(after.cards[land].tapped).toBe(false);
  await expect(lines()).toHaveCount(linesBefore + 1);
  await expect(lines().last()).toContainText('tapped 3 permanents');

  await undoTo(before);
  // Undo keeps the selection: the cards never left the battlefield.
  await expect(selected()).toHaveCount(3);
});

test('the menu of a selected card offers the group', async () => {
  const before = await gameState();
  await fieldCard(creatures[0]).click({
    button: 'right',
    position: { x: 8, y: 8 },
  });
  await menuItem(board, 'Tap 3 cards').click();
  const after = await oneAction(before, 'setTapped');
  expect(creatures.every((id) => after.cards[id].tapped)).toBe(true);
  await undoTo(before);
});

test('a plain click on a selected card taps only that card', async () => {
  const before = await gameState();
  const at = await cornerOf(creatures[0]);
  await board.mouse.click(at.x, at.y);
  const after = await oneAction(before, 'toggleTap');
  expect(creatures.map((id) => after.cards[id].tapped)).toEqual([
    true,
    false,
    false,
  ]);
  await expect(selected()).toHaveCount(3);
  await undoTo(before);
});

test('a group dragged on the field keeps its layout as one action', async () => {
  const before = await gameState();
  const from = await cornerOf(creatures[2]);
  await dragTo(from, { x: from.x + 120, y: from.y + 90 });
  const after = await oneAction(before, 'setPositions');
  const shifts = creatures.map((id) => ({
    dx: after.cards[id].position!.x - before.cards[id].position!.x,
    dy: after.cards[id].position!.y - before.cards[id].position!.y,
  }));
  expect(shifts[0].dx).toBeGreaterThan(50);
  expect(shifts[0].dy).toBeGreaterThan(30);
  expect(shifts).toEqual([shifts[0], shifts[0], shifts[0]]);
  expect(after.cards[land].position).toEqual(before.cards[land].position);
  await expect(selected()).toHaveCount(3);
});

test('dragging the group to the graveyard is one action', async () => {
  const before = await gameState();
  const linesBefore = await lines().count();
  const pile = await board.getByTestId('graveyard').boundingBox();
  if (!pile) throw new Error('no graveyard');
  await dragTo(await cornerOf(creatures[0]), {
    x: pile.x + pile.width / 2,
    y: pile.y + pile.height / 2,
  });
  const after = await oneAction(before, 'moveCards');
  expect(me(after).zones.graveyard).toEqual(expect.arrayContaining(creatures));
  expect(me(after).zones.battlefield).toEqual([land]);
  await expect(lines()).toHaveCount(linesBefore + 1);
  // They left the battlefield, so they left the selection too.
  await expect(selected()).toHaveCount(0);

  await undoTo(before);
  await expect(board.getByTestId('battlefield-card')).toHaveCount(4);
  await expect(selected()).toHaveCount(0);
});

test('a box from empty battlefield selects; Esc and a click clear it', async () => {
  const spot = await emptySpot();
  await dragTo(spot, { x: spot.box.x + 4, y: spot.box.y + 4 });
  await expect(board.getByTestId('selection-box')).toHaveCount(0);
  await expect(selected()).toHaveCount(4);

  await board.keyboard.press('Escape');
  await expect(selected()).toHaveCount(0);

  await shiftClick(creatures[0]);
  await shiftClick(land);
  await expect(selected()).toHaveCount(2);
  // A right-click on the field still opens its menu, and keeps the group.
  await board.mouse.click(spot.x, spot.y, { button: 'right' });
  await expect(menuItem(board, 'Move permanents…')).toBeVisible();
  await board.keyboard.press('Escape');
  await expect(board.getByRole('menu')).toHaveCount(0);
  await expect(selected()).toHaveCount(2);

  await board.mouse.click(spot.x, spot.y);
  await expect(selected()).toHaveCount(0);
});

test('a new game clears the selection', async () => {
  for (const id of creatures) await shiftClick(id);
  await expect(selected()).toHaveCount(3);
  await board.mouse.move(2, 2);
  await board.keyboard.press('r');
  await board
    .getByRole('dialog')
    .getByRole('button', { name: 'Restart' })
    .click();
  await expect(board.getByTestId('battlefield-card')).toHaveCount(0);
  await expect(selected()).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
