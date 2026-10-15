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
let creature = '';
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

const handCard = (id: string) =>
  hand
    .getByTestId('hand')
    .getByTestId('card')
    .and(hand.locator(`[data-instance-id="${id}"]`));
const fieldCard = (id: string) =>
  board
    .getByTestId('battlefield')
    .locator(`[data-testid="card"][data-instance-id="${id}"]`);
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });
const openMenu = async (id: string) => {
  const box = await fieldCard(id).boundingBox();
  if (!box) throw new Error(`no card ${id}`);
  await board.mouse.click(box.x + 8, box.y + 8, { button: 'right' });
};

const oneAction = async (before: GameState, type: string) => {
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length + 1);
  const after = await gameState();
  expect(after.log.at(-1)?.type).toBe(type);
  return after;
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-state-'));
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
  await app.evaluate(() =>
    (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(11)
  );
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);

  let state = await gameState();
  const inHand = (test: (s: GameState, id: string) => boolean) =>
    me(state).zones.hand.filter((id) => test(state, id));
  while (inHand(isCreature).length < 1 || inHand(isLand).length < 1) {
    await board.keyboard.press('d');
    state = await oneAction(state, 'draw');
  }
  land = inHand(isLand)[0];
  creature = inHand(isCreature)[0];
  for (const id of [land, creature]) {
    await handCard(id).click({ button: 'right' });
    await menuItem(hand, 'Play').click();
    state = await oneAction(state, 'moveCard');
  }
  await expect(board.getByTestId('battlefield-card')).toHaveCount(2);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a doesn't-untap permanent stays tapped through the next turn", async () => {
  let state = await gameState();
  for (const id of [land, creature]) {
    await fieldCard(id).click({ position: { x: 8, y: 8 } });
    state = await oneAction(state, 'toggleTap');
  }
  await openMenu(creature);
  await menuItem(board, "Doesn't untap").click();
  state = await oneAction(state, 'setCardState');
  expect(state.cards[creature].doesntUntap).toBe(true);
  await expect(
    fieldCard(creature).getByTestId('doesnt-untap-badge')
  ).toBeVisible();

  await board.getByRole('button', { name: 'Next turn' }).click();
  state = await oneAction(state, 'nextTurn');
  expect(state.cards[creature].tapped).toBe(true);
  expect(state.cards[land].tapped).toBe(false);

  // Untap all leaves it tapped too, and with nothing else to untap it
  // changes nothing at all.
  await board.keyboard.press('u');
  await fieldCard(land).click({ position: { x: 8, y: 8 } });
  state = await oneAction(state, 'toggleTap');
  await board.keyboard.press('u');
  state = await oneAction(state, 'untapAll');
  expect(state.cards[creature].tapped).toBe(true);
  expect(state.cards[land].tapped).toBe(false);
});

test('a base P/T, counters on top, and abilities show as badges', async () => {
  let state = await gameState();
  await openMenu(creature);
  await menuItem(board, 'Set base P/T…').click();
  const dialog = board.getByTestId('pt-dialog');
  await dialog.getByLabel('Power').fill('5');
  await dialog.getByLabel('Toughness').fill('4');
  await dialog.getByRole('button', { name: 'OK' }).click();
  state = await oneAction(state, 'setCardState');
  await expect(fieldCard(creature).getByTestId('pt-badge')).toHaveText('5/4');

  await openMenu(creature);
  await menuItem(board, 'Add +1/+1 counter').click();
  state = await oneAction(state, 'adjustCounter');
  await expect(fieldCard(creature).getByTestId('pt-badge')).toHaveText('6/5');

  await openMenu(creature);
  await menuItem(board, 'Abilities…').click();
  const abilities = board.getByTestId('abilities-dialog');
  await abilities.getByRole('button', { name: 'flying', exact: true }).click();
  await abilities.getByRole('button', { name: 'goaded', exact: true }).click();
  await abilities.getByLabel('Other ability').fill('protection from red');
  await abilities.getByRole('button', { name: 'Add', exact: true }).click();
  await abilities.getByRole('button', { name: 'Apply' }).click();
  state = await oneAction(state, 'setCardState');
  await expect(fieldCard(creature).getByTestId('ability-badge')).toHaveText([
    'Flying',
    'Goaded',
    'Protection from red',
  ]);

  await openMenu(land);
  await menuItem(board, 'Becomes a creature…').click();
  await board
    .getByTestId('pt-dialog')
    .getByRole('button', { name: 'OK' })
    .click();
  await oneAction(state, 'setCardState');
  await expect(fieldCard(land).getByTestId('pt-badge')).toHaveText('0/0');
  await expect(
    board.getByTestId('log-entry').filter({ hasText: 'a 0/0 creature' })
  ).toHaveCount(1);
});

test('a selection is marked in one step, and undo takes it back', async () => {
  const before = await gameState();
  await board.keyboard.down('Shift');
  for (const id of [land, creature]) {
    await fieldCard(id).click({ position: { x: 8, y: 8 } });
  }
  await board.keyboard.up('Shift');
  await openMenu(land);
  await menuItem(board, "Doesn't untap (2)").click();
  const after = await oneAction(before, 'setCardState');
  expect(after.cards[land].doesntUntap).toBe(true);
  await board.keyboard.press('Escape');

  await hand.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before.log.length);
  expect((await gameState()).cards).toEqual(before.cards);
});

test('leaving the battlefield clears the state, like counters', async () => {
  let state = await gameState();
  await openMenu(creature);
  await menuItem(board, 'Move to hand').click();
  state = await oneAction(state, 'moveCard');
  const card = state.cards[creature];
  expect(card.doesntUntap).toBeUndefined();
  expect(card.ptOverride).toBeUndefined();
  expect(card.abilities).toBeUndefined();
  await handCard(creature).click({ button: 'right' });
  await menuItem(hand, 'Play').click();
  await oneAction(state, 'moveCard');
  await expect(fieldCard(creature).getByTestId('ability-badges')).toHaveCount(
    0
  );
});

test('the mana pool fills, and empties on a step change when asked', async () => {
  const pool = board.getByTestId('mana-pool');
  const green = pool.locator('[data-mana="G"]');
  let state = await gameState();
  await green.click();
  state = await oneAction(state, 'adjustPlayerCounter');
  await green.click();
  state = await oneAction(state, 'adjustPlayerCounter');
  await expect(green).toHaveAttribute('data-count', '2');
  await green.click({ button: 'right' });
  state = await oneAction(state, 'adjustPlayerCounter');
  await expect(green).toHaveAttribute('data-count', '1');

  await board.getByRole('checkbox', { name: 'empty mana' }).check();
  await board.getByTestId('phase-combat').click();
  state = await oneAction(state, 'setPhase');
  expect(me(state).counters).toEqual({});
  await expect(green).toHaveAttribute('data-count', '0');
});

test('more dice roll from the table panel and the number keys', async () => {
  const table = board.getByTestId('table-panel');
  const events = table.getByTestId('table-event');
  await table.getByRole('button', { name: 'Roll two d6' }).click();
  await expect(events.last()).toContainText(/rolled 2d6: \d \+ \d = \d+/);
  await table.getByRole('button', { name: 'Roll the planar die' }).click();
  await expect(events.last()).toContainText(
    /rolled the planar die: (chaos|planeswalk|blank)/
  );
  await table.getByRole('button', { name: 'Roll a d12' }).click();
  await expect(events.last()).toContainText(/rolled a d12: \d+/);
  await board.keyboard.press('1');
  await expect(events.last()).toContainText(/flipped a coin/);
  await expect(events).toHaveCount(4);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
