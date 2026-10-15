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
const names = (state: GameState, ids: string[]) =>
  ids.map((id) => state.cards[id].ref.name);

const strip = () => hand.getByTestId('known-cards');
const pills = (end: 'top' | 'bottom') =>
  hand.getByTestId(`known-${end}`).getByTestId('card-pill');

const expectStrip = async (top: string[], bottom: string[]) => {
  if (top.length === 0 && bottom.length === 0) {
    await expect(strip()).toHaveCount(0);
    return;
  }
  await expect(pills('top')).toHaveText(top);
  await expect(pills('bottom')).toHaveText(bottom);
};

// Waits for exactly one more action, and returns the state after it.
const oneAction = async (before: GameState, type: string) => {
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length + 1);
  const after = await gameState();
  expect(after.log.at(-1)?.type).toBe(type);
  return after;
};

const undo = async (before: GameState) => {
  await hand.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length - 1);
  return gameState();
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-known-'));
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

test('scry 2 fills the strip; a draw and its undo keep it right', async () => {
  await expect(strip()).toHaveCount(0);
  const start = await gameState();
  const [a, b] = me(start).zones.library;

  // Scry 2 from the keyboard: keep the first, bottom the second.
  await hand.getByRole('button', { name: 'Look at top…' }).click();
  await expect(hand.getByLabel('How many cards?')).toBeFocused();
  await hand.keyboard.press('Shift+Tab');
  await hand.keyboard.type('scry');
  await hand.keyboard.press('Tab');
  await hand.keyboard.type('2');
  await hand.keyboard.press('Enter');
  await expect(hand.getByTestId('look-card')).toHaveCount(2);
  await hand.keyboard.press('ArrowRight');
  await hand.keyboard.press('b');
  await hand.keyboard.press('Enter');
  const scried = await oneAction(start, 'arrangeTop');
  await expectStrip(names(scried, [a]), names(scried, [b]));

  // The strip is the hand's alone.
  await expect(board.getByTestId('known-cards')).toHaveCount(0);

  await hand.keyboard.press('d');
  const drawn = await oneAction(scried, 'draw');
  await expect(pills('top')).toHaveCount(0);
  await expect(pills('bottom')).toHaveText(names(drawn, [b]));

  // The drawn card goes back on top, and the player knows it.
  await undo(drawn);
  await expectStrip(names(scried, [a]), names(scried, [b]));
});

test('a shuffle clears the strip', async () => {
  const before = await gameState();
  await expect(strip()).toBeVisible();
  await hand.keyboard.press('s');
  await oneAction(before, 'shuffle');
  await expect(strip()).toHaveCount(0);
});

test('Brainstorm: the two cards put back show on top, in order', async () => {
  const start = await gameState();
  for (let i = 0; i < 3; i += 1) await hand.keyboard.press('d');
  await expect
    .poll(async () => me(await gameState()).zones.hand.length)
    .toBe(me(start).zones.hand.length + 3);
  const drawn = await gameState();
  const [first, , third] = me(drawn).zones.hand.slice(-3);
  const card = (id: string) =>
    hand
      .getByTestId('hand')
      .getByTestId('card')
      .and(hand.locator(`[data-instance-id="${id}"]`));

  await card(third).click({ button: 'right' });
  await hand
    .getByRole('menuitem', { name: 'Put cards on top…', exact: true })
    .click();
  await card(first).click();
  await hand.getByRole('button', { name: 'Put 2 on top' }).click();
  const after = await oneAction(drawn, 'putFromHand');
  await expectStrip(names(after, [third, first]), []);

  // Undone, the cards are in the hand again and the strip forgets them.
  const undone = await undo(after);
  expect(me(undone).zones.hand).toContain(first);
  await expect(strip()).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
