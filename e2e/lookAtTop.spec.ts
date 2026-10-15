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
const library = async () => me(await gameState()).zones.library;
const nameOf = (state: GameState, id: string) => state.cards[id].ref.name;

const lines = () => board.getByTestId('log-entry');
const look = () => hand.getByTestId('look-card');

// Every card id the board window's DOM mentions.
const boardIds = () =>
  board
    .locator('[data-instance-id]')
    .evaluateAll((els) => els.map((el) => el.dataset.instanceId));

// Opens the look from the keyboard: the count is focused, the effect is
// one Shift+Tab up, and a select picks an option by typing its name.
const openLook = async (effect: string, count: number, take?: number) => {
  await hand.getByRole('button', { name: 'Look at top…' }).click();
  await expect(hand.getByLabel('How many cards?')).toBeFocused();
  await hand.keyboard.press('Shift+Tab');
  await hand.keyboard.type(effect);
  await hand.keyboard.press('Tab');
  await hand.keyboard.type(String(count));
  if (take !== undefined) {
    await hand.keyboard.press('Tab');
    await hand.keyboard.type(String(take));
  }
  await hand.keyboard.press('Enter');
  await expect(hand.getByTestId('look-at-top')).toBeVisible();
  // Keys act on the cards, so wait for the library to arrive.
  await expect(look()).toHaveCount(count);
  // The table hears about the look before anything is decided.
  await expect(board.getByTestId('library-activity')).toBeVisible();
};

// Confirms with Enter and checks the result is one action, one new log
// line and one undo step back to where the look started.
const confirmAsOneStep = async (expectedLine: string) => {
  const before = await gameState();
  const linesBefore = await lines().count();
  await hand.keyboard.press('Enter');
  await expect(hand.getByTestId('look-at-top')).toHaveCount(0);
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length + 1);
  const after = await gameState();
  expect(after.log.at(-1)?.type).toBe('arrangeTop');
  await expect(lines()).toHaveCount(linesBefore + 1);
  await expect(lines().last()).toContainText(expectedLine);
  return { before, after };
};

const undoTo = async (state: GameState) => {
  await hand.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(state.log.length);
  const undone = await gameState();
  expect(undone.players).toEqual(state.players);
  expect(undone.cards).toEqual(state.cards);
  expect(undone.rng).toEqual(state.rng);
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-look-'));
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

test('scry 2 from the keyboard: keep one, bottom one', async () => {
  const [a, b] = await library();
  await openLook('scry', 2);
  await expect(hand.getByRole('dialog', { name: 'Scry 2' })).toBeVisible();
  await expect(hand.getByTestId('look-lane-graveyard')).toHaveCount(0);
  // The look is private: the board never learns these cards.
  expect((await boardIds()).filter((id) => [a, b].includes(id!))).toEqual([]);

  await hand.keyboard.press('ArrowRight');
  await hand.keyboard.press('b');
  await expect(look().nth(1)).toHaveAttribute('data-dest', 'bottom');
  const { before } = await confirmAsOneStep(
    'looked at the top 2 cards of their library: 1 on top, 1 on the bottom'
  );
  const after = await library();
  expect(after[0]).toBe(a);
  expect(after.at(-1)).toBe(b);
  await undoTo(before);
});

test('surveil 2 from the keyboard names what goes to the graveyard', async () => {
  const state = await gameState();
  const [a] = me(state).zones.library;
  await openLook('surveil', 2);
  await hand.keyboard.press('g');
  const { after } = await confirmAsOneStep(
    `looked at the top 2 cards of their library: 1 on top, ` +
      `${nameOf(state, a)} into their graveyard`
  );
  expect(me(after).zones.graveyard).toEqual([a]);
  await expect(board.getByTestId('graveyard')).toHaveAttribute(
    'data-count',
    '1'
  );
  await undoTo(state);
});

test('look at 4, take 1 (Impulse) from the keyboard', async () => {
  const state = await gameState();
  const [a, b, c, d] = me(state).zones.library;
  await openLook('impulse', 4, 1);
  await expect(
    hand.getByRole('dialog', { name: 'Look at 4, take 1' })
  ).toBeVisible();
  await hand.keyboard.press('ArrowRight');
  await hand.keyboard.press('h');
  // Only one may go to hand.
  await hand.keyboard.press('ArrowLeft');
  await hand.keyboard.press('h');
  await expect(hand.getByTestId('look-take')).toContainText('(1/1)');
  const { after } = await confirmAsOneStep(
    'looked at the top 4 cards of their library: 3 on the bottom, ' +
      'a card into their hand'
  );
  expect(me(after).zones.hand).toContain(b);
  expect(me(after).zones.library.slice(-3)).toEqual([a, c, d]);
  await undoTo(state);
});

test('ponder from the keyboard: shuffle instead', async () => {
  const state = await gameState();
  // Ponder fills in three by itself.
  await hand.getByRole('button', { name: 'Look at top…' }).click();
  await hand.keyboard.press('Shift+Tab');
  await hand.keyboard.type('ponder');
  await expect(hand.getByLabel('How many cards?')).toHaveValue('3');
  await hand.keyboard.press('Tab');
  await hand.keyboard.press('Enter');
  await expect(look()).toHaveCount(3);
  await hand.keyboard.press('Shift+ArrowRight');
  await hand.keyboard.press('s');
  await expect(hand.getByLabel('Shuffle instead (S)')).toBeChecked();
  const { after } = await confirmAsOneStep(
    'looked at the top 3 cards of their library and shuffled'
  );
  expect(after.rng).not.toEqual(state.rng);
  expect(me(after).zones.library).toHaveLength(me(state).zones.library.length);
  await undoTo(state);
});

test('dig exiles by default and names the exiled cards', async () => {
  const state = await gameState();
  const [a, b] = me(state).zones.library;
  await openLook('dig', 2);
  await expect(look().first()).toHaveAttribute('data-dest', 'exile');
  const { after } = await confirmAsOneStep(
    `looked at the top 2 cards of their library: ` +
      `${nameOf(state, a)}, ${nameOf(state, b)} into exile`
  );
  expect(me(after).zones.exile).toEqual([a, b]);
  await expect(board.getByTestId('exile')).toHaveAttribute('data-count', '2');
  await undoTo(state);
});

test('a random bottom replays the same after an undo', async () => {
  const state = await gameState();
  const looked = me(state).zones.library.slice(0, 5);
  await openLook('scry', 5);
  await hand.getByLabel('Bottom in random order').check();
  // Clicking the button hands focus back, so Enter confirms the look.
  await hand.getByRole('button', { name: 'Rest to bottom (R)' }).click();
  await expect(hand.getByTestId('look-lane-bottom')).toContainText(
    'random order'
  );
  const { after } = await confirmAsOneStep(
    'looked at the top 5 cards of their library: 5 on the bottom in a ' +
      'random order'
  );
  const bottom = me(after).zones.library.slice(-5);
  expect([...bottom].sort()).toEqual([...looked].sort());
  expect(bottom).not.toEqual(looked);

  // Undoing a later draw replays the arrangement from the log.
  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(after.log.length + 1);
  await undoTo(after);
  expect((await library()).slice(-5)).toEqual(bottom);
});

test('cards drag between and within lanes', async () => {
  const [a, b, c] = await library();
  await openLook('look', 3);
  const tile = (id: string) => hand.locator(`[data-look-tile="${id}"]`);
  const dragTo = async (id: string, x: number, y: number) => {
    const box = await tile(id).boundingBox();
    if (!box) throw new Error('no tile');
    await hand.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await hand.mouse.down();
    await hand.mouse.move(x, y, { steps: 6 });
    await expect(hand.getByTestId('look-drag-ghost')).toBeVisible();
    await hand.mouse.up();
  };

  // a into the empty graveyard lane.
  const grave = await hand.getByTestId('look-lane-graveyard').boundingBox();
  if (!grave) throw new Error('no lane');
  await dragTo(a, grave.x + grave.width - 20, grave.y + grave.height / 2);
  await expect(tile(a)).toHaveAttribute('data-dest', 'graveyard');

  // c in front of b on top.
  const first = await tile(b).boundingBox();
  if (!first) throw new Error('no tile');
  await dragTo(c, first.x + 2, first.y + first.height / 2);
  expect(
    await hand
      .getByTestId('look-lane-top')
      .locator('[data-look-tile]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-look-tile')))
  ).toEqual([c, b]);

  // A flick released outside the dialog ends the drag there.
  const box = await tile(b).boundingBox();
  if (!box) throw new Error('no tile');
  await hand.mouse.move(box.x + 5, box.y + 5);
  await hand.mouse.down();
  await hand.mouse.move(4, 4, { steps: 2 });
  await hand.mouse.up();
  await expect(hand.getByTestId('look-drag-ghost')).toHaveCount(0);
  const lane = await hand.getByTestId('look-lane-exile').boundingBox();
  if (!lane) throw new Error('no lane');
  await hand.mouse.click(lane.x + lane.width - 20, lane.y + lane.height / 2);
  await expect(tile(b)).toHaveAttribute('data-dest', 'top');

  await hand.keyboard.press('Escape');
  await expect(hand.getByTestId('look-at-top')).toHaveCount(0);
});

test('a one-card look names the card and previews it', async () => {
  const state = await gameState();
  const [a] = me(state).zones.library;
  await openLook('scry', 1);
  await expect(hand.getByTestId('look-single-name')).toContainText(
    nameOf(state, a)
  );
  await look().hover();
  await expect(hand.getByTestId('card-preview')).toBeVisible();
  await hand.keyboard.press('Escape');
});

test('the bottom card shows only in the hand window', async () => {
  const bottom = (await library()).at(-1)!;
  const state = await gameState();
  await board.getByTestId('library').click({ button: 'right' });
  await board
    .getByRole('menuitem', { name: 'View bottom card', exact: true })
    .click();
  const shown = hand.getByTestId('bottom-card').getByTestId('card');
  await expect(shown).toHaveAttribute('data-instance-id', bottom);
  await expect(shown).toHaveAttribute('data-card-name', nameOf(state, bottom));
  await expect(board.getByTestId('bottom-card')).toHaveCount(0);
  expect(await boardIds()).not.toContain(bottom);
  await expect(board.getByTestId('library-activity')).toHaveAttribute(
    'data-kind',
    'other'
  );
  // Only the play test windows may ask, and only for known dialogs.
  const appWindow = await windowByPage('app.html');
  await expect(
    appWindow.evaluate(() => window.api.openHandDialog('viewBottom'))
  ).rejects.toThrow(/untrusted sender/);
  await expect(
    hand.evaluate(() => window.api.openHandDialog('nope' as never))
  ).rejects.toThrow(/unknown hand dialog/);
  await hand.keyboard.press('Escape');
  await expect(hand.getByTestId('bottom-card')).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
