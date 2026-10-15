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

const handCards = () => hand.getByTestId('hand').getByTestId('card');
const handCard = (id: string) =>
  handCards().and(hand.locator(`[data-instance-id="${id}"]`));
const fieldCard = (id: string) =>
  board
    .getByTestId('battlefield')
    .getByTestId('card')
    .and(board.locator(`[data-instance-id="${id}"]`));

// The first card in hand whose type line matches.
const inHand = (state: GameState, type: RegExp) =>
  me(state).zones.hand.find((id) => type.test(state.cards[id].ref.typeLine));

// Presses a key and waits for exactly one more action of the given type.
const pressFor = async (page: Page, key: string, type: string) => {
  const before = (await gameState()).log.length;
  await page.keyboard.press(key);
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before + 1);
  const after = await gameState();
  expect(after.log.at(-1)?.type).toBe(type);
  return after;
};

// Waits long enough for a key that should do nothing to have done it.
const settle = async (page: Page) => {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve))
  );
  await page.waitForTimeout(150);
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-keys-'));
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: false, turnTracking: true })
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
  await app.evaluate(
    (_electron, seed) =>
      (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(seed),
    20261015
  );
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await expect(handCards()).toHaveCount(7);
  await expect(board.getByTestId('turn')).toHaveText('1');
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('a whole turn played from the keyboard', async () => {
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);

  // Draw for the turn, then keep drawing until there is a land and a
  // creature to play.
  let state = await pressFor(board, 'd', 'draw');
  while (!inHand(state, /Land/) || !inHand(state, /Creature/)) {
    state = await pressFor(board, 'd', 'draw');
  }
  const land = inHand(state, /Land/)!;
  const creature = inHand(state, /Creature/)!;

  // Play the land from the hand window and tap it on the board.
  await handCard(land).hover();
  state = await pressFor(hand, 'b', 'moveCard');
  expect(state.cards[land].zone).toBe('battlefield');
  await expect(fieldCard(land)).toBeVisible();
  await fieldCard(land).hover();
  state = await pressFor(board, 't', 'toggleTap');
  expect(state.cards[land].tapped).toBe(true);
  await expect(fieldCard(land)).toHaveClass(/rotate-90/);

  // Cast the creature, then attack with it.
  await handCard(creature).hover();
  state = await pressFor(hand, 'b', 'moveCard');
  expect(state.cards[creature].zone).toBe('battlefield');
  await fieldCard(creature).hover();
  state = await pressFor(board, 't', 'toggleTap');
  expect(state.cards[creature].tapped).toBe(true);

  // Lose a life and gain it back.
  await board.mouse.move(5, 5);
  state = await pressFor(board, 'ArrowDown', 'adjustLife');
  expect(me(state).life).toBe(19);
  state = await pressFor(board, '+', 'adjustLife');
  expect(me(state).life).toBe(20);

  // The next turn untaps and draws, as the turn panel is set to.
  const handSize = me(state).zones.hand.length;
  state = await pressFor(board, 'n', 'nextTurn');
  expect(me(state).turn).toBe(2);
  expect(state.cards[land].tapped).toBe(false);
  expect(state.cards[creature].tapped).toBe(false);
  expect(me(state).zones.hand).toHaveLength(handSize + 1);
  await expect(board.getByTestId('turn')).toHaveText('2');
});

test('hover keys move cards on the board and in the hand window', async () => {
  let state = await gameState();
  // The last played sits on top of the cascade.
  const onField = me(state).zones.battlefield.at(-1)!;
  await fieldCard(onField).hover();
  state = await pressFor(board, 'h', 'moveCard');
  expect(state.cards[onField].zone).toBe('hand');

  await handCard(onField).hover();
  state = await pressFor(hand, 'Shift+L', 'moveCard');
  expect(me(state).zones.library.at(-1)).toBe(onField);

  const top = me(state).zones.hand[0];
  await handCard(top).hover();
  state = await pressFor(hand, 'l', 'moveCard');
  expect(me(state).zones.library[0]).toBe(top);

  // A key that means nothing for a hand card does nothing.
  const next = me(state).zones.hand[0];
  await handCard(next).hover();
  await hand.keyboard.press('t');
  await settle(hand);
  expect((await gameState()).log).toHaveLength(state.log.length);
});

test('keys are ignored while typing', async () => {
  const before = await gameState();

  // In the search box of a dialog opened with V from the board.
  await board.keyboard.press('v');
  const search = hand.getByRole('dialog', { name: 'Search your library' });
  await expect(search).toBeVisible();
  await search.getByLabel('Search the library').pressSequentially('dust');
  await expect(search.getByLabel('Search the library')).toHaveValue('dust');
  await hand.keyboard.press('Escape');
  await expect(search).toHaveCount(0);

  // And in a text field outside any dialog.
  for (const page of [board, hand]) {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'scratch');
      document.body.append(input);
    });
    const field = page.getByLabel('scratch');
    await field.pressSequentially('dustvn');
    await field.press('ArrowDown');
    await expect(field).toHaveValue('dustvn');
    await field.evaluate((el) => el.remove());
  }
  await settle(board);
  const after = await gameState();
  expect(after.log).toHaveLength(before.log.length);
  expect(me(after).life).toBe(me(before).life);
});

test('Shift+V opens the look prompt in the hand window', async () => {
  await board.keyboard.press('Shift+V');
  const prompt = hand.getByRole('dialog', {
    name: 'Look at the top of your library',
  });
  await expect(prompt).toBeVisible();
  // Main focuses the hand window, whose game keys wait for the prompt.
  const before = await gameState();
  for (const key of ['d', 'u', 'ArrowUp']) await hand.keyboard.press(key);
  await settle(hand);
  expect((await gameState()).log).toHaveLength(before.log.length);
  await hand.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
});

test('R asks before restarting', async () => {
  await board.keyboard.press('r');
  const confirm = board.getByRole('dialog', { name: 'Restart game?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);

  await hand.keyboard.press('r');
  const fromHand = hand.getByRole('dialog', { name: 'Restart game?' });
  await fromHand.getByRole('button', { name: 'Restart' }).click();
  await expect(board.getByTestId('turn')).toHaveText('1');
  await expect(handCards()).toHaveCount(7);
  expect(me(await gameState()).keptHand).toBe(false);
});

test('the help lists hover keys on their own', async () => {
  await board.keyboard.press('?');
  const help = board.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help.getByRole('region', { name: 'Anywhere' })).toContainText(
    'Next turn'
  );
  await expect(
    help.getByRole('region', { name: 'Over one of your cards' })
  ).toContainText('Tap or untap');
  await board.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
