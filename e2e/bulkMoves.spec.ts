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
const isCreature = (state: GameState, id: string) =>
  /Creature/.test(state.cards[id].ref.faces[0]?.typeLine ?? '');

const lines = () => board.getByTestId('log-entry');
const handCard = (id: string) =>
  hand
    .getByTestId('hand')
    .getByTestId('card')
    .and(hand.locator(`[data-instance-id="${id}"]`));
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

// Right-clicks the field area's bottom-right corner, clear of the cards
// and the table panel.
const openFieldMenu = async () => {
  const area = board.getByTestId('battlefield').locator('..');
  const box = await area.boundingBox();
  if (!box) throw new Error('no battlefield');
  await board.mouse.click(box.x + box.width - 20, box.y + box.height - 20, {
    button: 'right',
  });
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-bulk-'));
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

test('destroy all creatures is one action, one line and one undo', async () => {
  // Play the whole hand, drawing until it holds a creature and a
  // non-creature to tell apart.
  let state = await gameState();
  while (
    !me(state).zones.hand.some((id) => isCreature(state, id)) ||
    me(state).zones.hand.every((id) => isCreature(state, id))
  ) {
    await board.keyboard.press('d');
    state = await oneAction(state, 'draw');
  }
  for (const id of me(state).zones.hand) {
    await handCard(id).click({ button: 'right' });
    await menuItem(hand, 'Play').click();
    state = await oneAction(state, 'moveCard');
  }
  const before = state;
  const field = me(before).zones.battlefield;
  const creatures = field.filter((id) => isCreature(before, id));
  const others = field.filter((id) => !isCreature(before, id));

  const linesBefore = await lines().count();
  await openFieldMenu();
  await menuItem(board, 'Move permanents…').click();
  const dialog = board.getByRole('dialog', { name: 'Move permanents' });
  await expect(
    dialog.getByRole('rowheader', { name: /^Creatures/ })
  ).toContainText(`(${creatures.length})`);
  await dialog.getByRole('button', { name: 'Creatures to graveyard' }).click();
  await expect(dialog).toHaveCount(0);

  const after = await oneAction(before, 'moveAll');
  expect(me(after).zones.battlefield).toEqual(others);
  expect(me(after).zones.graveyard).toEqual(creatures);
  await expect(lines()).toHaveCount(linesBefore + 1);
  await expect(lines().last()).toContainText(
    `put ${creatures.length} creature${creatures.length === 1 ? '' : 's'} ` +
      'from the battlefield into their graveyard'
  );

  await undoTo(before);
});

test('exile top 5 is one action, one line and one undo', async () => {
  const before = await gameState();
  const top = me(before).zones.library.slice(0, 5);
  const linesBefore = await lines().count();

  await board.getByTestId('library').click({ button: 'right' });
  await menuItem(board, 'Exile top N…').click();
  const input = board.getByLabel('How many from the top?');
  await input.fill('5');
  await input.press('Enter');

  const after = await oneAction(before, 'mill');
  expect(me(after).zones.exile).toEqual(top);
  expect(me(after).zones.library).toEqual(me(before).zones.library.slice(5));
  await expect(lines()).toHaveCount(linesBefore + 1);
  const names = top.map((id) => after.cards[id].ref.name).join(', ');
  await expect(lines().last()).toContainText(
    `exiled the top 5 cards of their library: ${names}`
  );

  await undoTo(before);
});

test('the whole library goes to the graveyard only after confirming', async () => {
  const before = await gameState();
  await board.getByTestId('library').click({ button: 'right' });
  await menuItem(board, 'Put library into graveyard…').click();
  const confirm = board.getByRole('dialog', { name: 'Mill your library?' });
  await expect(confirm).toContainText(
    `Puts all ${me(before).zones.library.length} cards`
  );
  await confirm.getByRole('button', { name: 'Mill library' }).click();

  const after = await oneAction(before, 'moveAll');
  expect(me(after).zones.library).toEqual([]);
  expect(me(after).zones.graveyard).toEqual([
    ...me(before).zones.graveyard,
    ...me(before).zones.library,
  ]);
  await expect(board.getByTestId('library')).toHaveAttribute('data-count', '0');
  await expect(lines().last()).toContainText(
    `put ${me(before).zones.library.length} cards from their library into ` +
      'their graveyard'
  );

  await undoTo(before);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
