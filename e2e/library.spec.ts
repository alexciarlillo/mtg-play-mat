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
import { battlefieldMenuItem } from './gameMenu';

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  openSampleCommanderPlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
}

const LEADER = 'Colossal Dreadmaw';

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

type Hooks = { testHooks: TestHooks };

const openSample = (seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(s),
    seed
  );

const openCommanderSample = (seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (globalThis as unknown as Hooks).testHooks.openSampleCommanderPlayTest(s),
    seed
  );

const gameState = () =>
  app.evaluate(() => (globalThis as unknown as Hooks).testHooks.gameState());

const me = (state: GameState) => state.players[0];

const handCards = () => hand.getByTestId('hand').getByTestId('card');
const fieldCards = () => board.getByTestId('battlefield').getByTestId('card');
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

// Every card id the board window's DOM mentions.
const boardIds = () =>
  board
    .locator('[data-instance-id]')
    .evaluateAll((els) => els.map((el) => el.dataset.instanceId));

const keep = async () => {
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-lib-'));
  // Later steps drive the turn panel, which is off by default.
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ turnTracking: true })
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

  // The test hooks exist once the app has started and opened its window.
  await windowByPage('app.html');
  await openSample(8);
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await keep();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('only the hand window can read the library', async () => {
  const size = await hand.evaluate(async () => {
    const cards = await window.api.getLibrary();
    return cards.length;
  });
  expect(size).toBe(53);
  await expect(board.evaluate(() => window.api.getLibrary())).rejects.toThrow(
    /untrusted sender/
  );
});

test('look at the top 3, reorder, and send one to the bottom', async () => {
  const before = me(await gameState()).zones.library;
  const [a, b, c] = before;

  await hand.getByRole('button', { name: 'Look at top…' }).click();
  await hand.getByLabel('How many cards?').fill('3');
  await hand.getByRole('button', { name: 'OK', exact: true }).click();

  const look = hand.getByTestId('look-card');
  await expect(look).toHaveCount(3);
  expect(
    await look.evaluateAll((els) => els.map((el) => el.dataset.instanceId))
  ).toEqual([a, b, c]);
  // The look is private: the board never learns these cards.
  expect((await boardIds()).filter((id) => [a, b, c].includes(id!))).toEqual(
    []
  );
  await expect(board.getByTestId('look-at-top')).toHaveCount(0);

  await look.nth(0).getByRole('button', { name: 'Move right' }).click();
  await look.nth(2).getByLabel('Destination').selectOption('bottom');
  await hand.getByRole('button', { name: 'Confirm' }).click();
  await expect(look).toHaveCount(0);

  await expect
    .poll(async () => me(await gameState()).zones.library.slice(0, 2))
    .toEqual([b, a]);
  const after = me(await gameState()).zones.library;
  expect(after.at(-1)).toBe(c);
  expect(after).toHaveLength(53);
  expect((await gameState()).log.at(-1)?.type).toBe('arrangeTop');
});

test('mill 2 puts the top two in the graveyard', async () => {
  const [a, b] = me(await gameState()).zones.library;
  await (await battlefieldMenuItem(board, 'Mill N…')).click();
  await board.getByLabel('How many from the top?').fill('2');
  await board.getByRole('button', { name: 'OK', exact: true }).click();

  await expect(board.getByTestId('graveyard')).toHaveAttribute(
    'data-count',
    '2'
  );
  await expect(board.getByTestId('library')).toHaveAttribute(
    'data-count',
    '51'
  );
  expect(me(await gameState()).zones.graveyard).toEqual([a, b]);
});

test('search for a land to hand, then shuffle', async () => {
  const handBefore = await handCards().count();
  const libraryBefore = me(await gameState()).zones.library;

  await hand.getByRole('button', { name: 'Search library…' }).click();
  await hand.getByLabel('Filter by name or type').fill('land');
  const found = hand.getByTestId('search-card');
  await expect(found.first()).toBeVisible();
  const names = await found
    .getByTestId('card')
    .evaluateAll((els) => els.map((el) => el.dataset.cardName));
  expect(new Set(names)).toEqual(new Set(['Forest']));

  const picked = await found
    .first()
    .getByTestId('card')
    .getAttribute('data-instance-id');
  await found.first().getByTestId('card').click();
  await hand.getByRole('button', { name: 'Move 1 and shuffle' }).click();

  await expect(handCards()).toHaveCount(handBefore + 1);
  await expect(
    hand.getByTestId('hand').locator(`[data-instance-id="${picked}"]`)
  ).toHaveAttribute('data-card-name', 'Forest');
  const libraryAfter = me(await gameState()).zones.library;
  expect(libraryAfter).toHaveLength(libraryBefore.length - 1);
  expect(libraryAfter).not.toEqual(libraryBefore.filter((id) => id !== picked));
});

test('a revealed hand card shows on the board until the next action', async () => {
  const card = handCards().first();
  const name = await card.getAttribute('data-card-name');
  const reveal = board.getByTestId('reveal-panel');
  await expect(reveal).toHaveCount(0);

  await card.click({ button: 'right' });
  await menuItem(hand, 'Reveal').click();
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('data-source', 'card');
  await expect(reveal.getByTestId('card')).toHaveCount(1);
  await expect(reveal.getByTestId('card')).toHaveAttribute(
    'data-card-name',
    name!
  );
  await expect(hand.getByTestId('hand-reveal-banner')).toBeVisible();

  // Any other action by the player ends the reveal.
  await board.keyboard.press('d');
  await expect(reveal).toHaveCount(0);
  await expect(hand.getByTestId('hand-reveal-banner')).toHaveCount(0);

  // The whole hand, put away with Hide.
  await hand.getByRole('button', { name: 'Reveal hand' }).click();
  await expect(reveal.getByTestId('card')).toHaveCount(
    await handCards().count()
  );
  await reveal.getByRole('button', { name: 'Hide' }).click();
  await expect(reveal).toHaveCount(0);
});

test('next turn counts up, untaps, and draws', async () => {
  const forest = hand
    .getByTestId('hand')
    .locator('[data-card-name="Forest"]')
    .first();
  await forest.click();
  const land = board
    .getByTestId('battlefield')
    .locator('[data-card-name="Forest"]')
    .first();
  await land.click();
  await expect(land).toHaveClass(/rotate-90/);
  await expect(board.getByTestId('turn')).toHaveText('1');
  const handBefore = await handCards().count();

  await board.getByTestId('phase-combat').click();
  await expect(board.getByTestId('phase-combat')).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await board.getByRole('button', { name: 'Next turn' }).click();
  await expect(board.getByTestId('turn')).toHaveText('2');
  await expect(land).not.toHaveClass(/rotate-90/);
  await expect(handCards()).toHaveCount(handBefore + 1);
  await expect(board.getByTestId('phase-main1')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('Cmd/Ctrl+Z untaps a tapped card and Shift redoes it', async () => {
  const land = fieldCards().first();
  await land.click();
  await expect(land).toHaveClass(/rotate-90/);

  await board.keyboard.press('ControlOrMeta+z');
  await expect(land).not.toHaveClass(/rotate-90/);
  const redo = hand.getByRole('button', { name: 'Redo' });
  await expect(redo).toBeEnabled();

  await board.keyboard.press('ControlOrMeta+Shift+z');
  await expect(land).toHaveClass(/rotate-90/);
  await expect(redo).toBeDisabled();

  // The hand window has the same keys and buttons.
  await hand.keyboard.press('ControlOrMeta+z');
  await expect(land).not.toHaveClass(/rotate-90/);
  await hand.getByRole('button', { name: 'Redo' }).click();
  await expect(land).toHaveClass(/rotate-90/);

  // Undo walks back through the turn too.
  await board.keyboard.press('ControlOrMeta+z');
  await board.keyboard.press('ControlOrMeta+z');
  await expect(board.getByTestId('turn')).toHaveText('1');
  await expect(land).toHaveClass(/rotate-90/);
  await board.keyboard.press('ControlOrMeta+Shift+z');
  await expect(board.getByTestId('turn')).toHaveText('2');
  await expect(land).not.toHaveClass(/rotate-90/);
});

test('a text field keeps its own undo', async () => {
  await hand.getByRole('button', { name: 'Search library…' }).click();
  const filter = hand.getByLabel('Filter by name or type');
  const before = (await gameState()).seq;
  await filter.fill('forest');
  await filter.press('ControlOrMeta+z');
  await hand.keyboard.press('Escape');
  expect((await gameState()).seq).toBe(before);
});

test('undoing a commander prompt answer keeps the prompt consistent', async () => {
  await openCommanderSample(9);
  // A new game starts with no history.
  await expect(hand.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(hand.getByRole('button', { name: 'Redo' })).toBeDisabled();
  await keep();

  const commander = board
    .getByTestId('command-zone')
    .locator(`[data-testid="commander"][data-card-name="${LEADER}"]`);
  const tax = commander.getByTestId('commander-tax');
  const prompt = board.getByRole('dialog', {
    name: 'Return to command zone?',
  });
  const onField = board
    .getByTestId('battlefield')
    .locator(`[data-testid="card"][data-card-name="${LEADER}"]`);

  await commander.getByTestId('card').click();
  await expect(onField).toHaveCount(1);
  await expect(tax).toHaveText('Tax +2');

  await onField.click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();
  await expect(prompt).toContainText('went to the graveyard');
  await prompt.getByRole('button', { name: 'Yes' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(commander).toHaveAttribute('data-zone', 'command');

  // Undoing the Yes puts it back in the graveyard, and asks again.
  await board.keyboard.press('ControlOrMeta+z');
  await expect(commander).toHaveAttribute('data-zone', 'graveyard');
  await expect(prompt).toContainText('went to the graveyard');
  await expect(tax).toHaveText('Tax +2');

  // No leaves it there; undoing the death drops the prompt for good.
  await prompt.getByRole('button', { name: 'No' }).click();
  await expect(prompt).toHaveCount(0);
  await board.keyboard.press('ControlOrMeta+z');
  await expect(commander).toHaveAttribute('data-zone', 'battlefield');
  await expect(onField).toHaveCount(1);
  await expect(prompt).toHaveCount(0);
  await expect(board.getByTestId('graveyard')).toHaveAttribute(
    'data-count',
    '0'
  );

  // Redo repeats the death, prompt and all.
  await board.keyboard.press('ControlOrMeta+Shift+z');
  await expect(commander).toHaveAttribute('data-zone', 'graveyard');
  await expect(prompt).toBeVisible();
  const prompts = await board.evaluate(() => window.api.getCommanderPrompts());
  const state = await gameState();
  expect(prompts.map((p) => state.cards[p.instanceId]?.zone)).toEqual([
    'graveyard',
  ]);
  await prompt.getByRole('button', { name: 'Yes' }).click();
  await expect(commander).toHaveAttribute('data-zone', 'command');
});

test('restarting clears the history', async () => {
  await (await battlefieldMenuItem(board, 'Restart game…')).click();
  await board
    .getByRole('dialog', { name: 'Restart game?' })
    .getByRole('button', { name: 'Restart' })
    .click();
  await expect(board.getByTestId('turn')).toHaveText('1');
  await expect(hand.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(await battlefieldMenuItem(board, 'Undo')).toBeDisabled();
  await board.keyboard.press('Escape');
  await board.keyboard.press('ControlOrMeta+z');
  await expect(hand.getByTestId('mulligan-bar')).toBeVisible();
  await expect(handCards()).toHaveCount(7);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
