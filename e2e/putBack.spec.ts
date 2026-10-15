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
const nameOf = (state: GameState, id: string) => state.cards[id].ref.name;

const lines = () => board.getByTestId('log-entry');
const handCards = () => hand.getByTestId('hand').getByTestId('card');
const handCard = (id: string) =>
  handCards().and(hand.locator(`[data-instance-id="${id}"]`));
const fieldCard = (id: string) =>
  board
    .getByTestId('battlefield')
    .getByTestId('card')
    .and(board.locator(`[data-instance-id="${id}"]`));
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

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-put-back-'));
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
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('Brainstorm: draw 3, put 2 back on top in a chosen order', async () => {
  const start = await gameState();
  for (let i = 0; i < 3; i += 1) await hand.keyboard.press('d');
  await expect
    .poll(async () => me(await gameState()).zones.hand.length)
    .toBe(me(start).zones.hand.length + 3);
  const drawn = await gameState();
  const [first, , third] = me(drawn).zones.hand.slice(-3);

  const linesBefore = await lines().count();
  await handCard(third).click({ button: 'right' });
  await menuItem(hand, 'Put cards on top…').click();
  await expect(hand.getByTestId('put-back-bar')).toContainText(
    '1 ends up on top'
  );
  await handCard(first).click();
  await expect(hand.getByTestId('pick-number')).toHaveCount(2);
  // Picking plays nothing.
  expect((await gameState()).log.length).toBe(drawn.log.length);
  await hand.getByRole('button', { name: 'Put 2 on top' }).click();

  const after = await oneAction(drawn, 'putFromHand');
  expect(me(after).zones.library.slice(0, 2)).toEqual([third, first]);
  expect(me(after).zones.hand).not.toContain(third);
  expect(me(after).zones.hand).not.toContain(first);
  await expect(hand.getByTestId('put-back-bar')).toHaveCount(0);
  await expect(lines()).toHaveCount(linesBefore + 1);
  await expect(lines().last()).toContainText(
    'put 2 cards on top of their library from their hand'
  );
  // The board never learns which cards went back.
  for (const id of [first, third]) {
    await expect(board.locator(`[data-instance-id="${id}"]`)).toHaveCount(0);
    await expect(lines().last()).not.toContainText(nameOf(after, id));
  }

  // The look dialog shows them on top, in that order.
  await hand.getByRole('button', { name: 'Look at top…' }).click();
  await hand.getByLabel('How many cards?').fill('2');
  await hand.keyboard.press('Enter');
  await expect(hand.getByTestId('look-card')).toHaveCount(2);
  expect(
    await hand
      .getByTestId('look-card')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.instanceId)
      )
  ).toEqual([third, first]);
  await hand.keyboard.press('Escape');
  await expect(hand.getByTestId('look-at-top')).toHaveCount(0);

  await undoTo(drawn);
});

test('play a card tapped from the hand', async () => {
  const before = await gameState();
  const [id] = me(before).zones.hand;
  await handCard(id).click({ button: 'right' });
  await menuItem(hand, 'Play tapped').click();
  const after = await oneAction(before, 'moveCard');
  expect(after.cards[id].zone).toBe('battlefield');
  expect(after.cards[id].tapped).toBe(true);
  await expect(fieldCard(id)).toHaveClass(/rotate-90/);
  await expect(lines().last()).toContainText(
    `played ${nameOf(after, id)} tapped`
  );
});

test('put a permanent 3rd from the top of the library', async () => {
  const before = await gameState();
  const [id] = me(before).zones.battlefield;
  await fieldCard(id).click({ button: 'right' });
  await menuItem(board, 'Put Xth from top…').click();
  const input = board.getByLabel(/Position from the top/);
  await input.fill('3');
  await input.press('Enter');
  const after = await oneAction(before, 'moveCard');
  expect(me(after).zones.library.slice(0, 2)).toEqual(
    me(before).zones.library.slice(0, 2)
  );
  expect(me(after).zones.library[2]).toBe(id);
  await expect(lines().last()).toContainText(
    `put ${nameOf(after, id)} into their library 3rd from the top`
  );
});

test('put a hand card past the end of the library goes to the bottom', async () => {
  const before = await gameState();
  const [id] = me(before).zones.hand;
  await handCard(id).click({ button: 'right' });
  await menuItem(hand, 'Put Xth from top…').click();
  const input = hand.getByLabel(/Position from the top/);
  await input.fill('500');
  await input.press('Enter');
  const after = await oneAction(before, 'moveCard');
  expect(me(after).zones.library.at(-1)).toBe(id);
  await expect(lines().last()).toContainText(
    'put a card from their hand on the bottom of their library'
  );
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
