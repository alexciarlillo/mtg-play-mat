import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';

import type { GameState, PlayerAction, Position } from '../src/shared/game';
import { type FakeScryfall, startFakeScryfall } from './fakeScryfall';
import { battlefieldMenuItem } from './gameMenu';

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
}

const SOLDIER_TOKEN = '1bdb2914-bba2-4cb6-802e-af2aeef46de8';
const DELVER = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

// One app instance with real (fixture) card data, so token search works.
test.describe.configure({ mode: 'serial' });

let scryfall: FakeScryfall;
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
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.gameState()
  );

const dispatch = (action: PlayerAction) =>
  board.evaluate((a) => window.api.dispatch(a), action);

const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

const fieldCards = () =>
  board.getByTestId('battlefield').getByTestId('battlefield-card');

const byId = (id: string): Locator =>
  board.locator(
    `[data-testid="battlefield-card"]:has([data-instance-id="${id}"])`
  );

const cardFace = (id: string) =>
  board.getByTestId('battlefield').locator(`[data-instance-id="${id}"]`);

// Puts the first library or hand card with this name onto the battlefield
// at a fixed spot, so later steps can find and drag it.
const putOnField = async (name: string, position: Position) => {
  const state = await gameState();
  const card = Object.values(state.cards).find(
    (c) =>
      (c.zone === 'library' || c.zone === 'hand') && c.ref.name.startsWith(name)
  );
  if (!card) throw new Error(`no ${name} left`);
  await dispatch({
    type: 'moveCard',
    instanceId: card.instanceId,
    to: 'battlefield',
    position,
  });
  await expect(cardFace(card.instanceId)).toBeVisible();
  return card.instanceId;
};

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-cards-'));
  // These steps drive the separate hand window.
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

  const appWindow = await windowByPage('app.html');
  await expect(appWindow.getByTestId('card-data-status')).toHaveAttribute(
    'data-phase',
    'idle'
  );
  await expect(appWindow.getByTestId('card-data-status')).toContainText(
    'cards)'
  );

  await app.evaluate(
    (_electron, seed) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.openSamplePlayTest(seed),
    7
  );
  board = await windowByPage('board.html');
  hand = await windowByPage('hand.html');
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);
});

test.afterAll(async () => {
  await app?.close();
  scryfall?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('creates two tokens from a card database search', async () => {
  const field = board.getByTestId('battlefield');
  const box = await field.boundingBox();
  if (!box) throw new Error('no battlefield');
  await board.mouse.click(box.x + box.width - 40, box.y + box.height - 40, {
    button: 'right',
  });
  await menuItem(board, 'Create token…').click();

  const dialog = board.getByRole('dialog', { name: 'Create token' });
  await dialog.getByLabel('Token name').fill('soldier');
  const result = dialog.getByTestId('token-result');
  await expect(result).toHaveCount(1);
  await expect(result.locator('img')).toHaveAttribute(
    'src',
    `card://${SOLDIER_TOKEN}/0/normal`
  );
  await result.click();
  await dialog.getByLabel('How many?').fill('2');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toHaveCount(0);

  const tokens = field.locator('[data-token="true"]');
  await expect(tokens).toHaveCount(2);
  await expect(tokens.first()).toHaveAttribute('data-card-name', 'Soldier');
  const state = await gameState();
  const created = Object.values(state.cards).filter((c) => c.isToken);
  expect(created).toHaveLength(2);
  expect(created[0].position).not.toEqual(created[1].position);
});

test('a +1/+1 counter shows a P/T badge; -1/-1 annihilates it', async () => {
  const token = board
    .getByTestId('battlefield')
    .locator('[data-token="true"]')
    .last();
  const id = (await token.getAttribute('data-instance-id'))!;

  await token.click({ button: 'right' });
  await menuItem(board, 'Add +1/+1 counter').click();
  await expect(token.getByTestId('pt-badge')).toHaveText('2/2');

  // The hover controls step the same counters.
  const wrapper = byId(id);
  await token.hover();
  await wrapper.getByRole('button', { name: 'Add +1/+1 counter' }).click();
  await expect(token.getByTestId('pt-badge')).toHaveText('3/3');
  await wrapper.getByRole('button', { name: 'Add -1/-1 counter' }).click();
  await expect(token.getByTestId('pt-badge')).toHaveText('2/2');
  expect((await gameState()).cards[id].counters).toEqual({ '+1/+1': 1 });
});

test('transforms a double-faced card', async () => {
  const id = await putOnField('Delver of Secrets', { x: 420, y: 60 });
  const face = cardFace(id);
  await expect(face.locator('img')).toHaveAttribute(
    'src',
    `card://${DELVER}/0/normal`
  );

  await face.click({ button: 'right' });
  await menuItem(board, 'Transform to Insectile Aberration').click();
  await expect(face).toHaveAttribute('data-face-index', '1');
  await expect(face.locator('img')).toHaveAttribute(
    'src',
    `card://${DELVER}/1/normal`
  );
  await expect(face.locator('img')).toHaveAttribute(
    'alt',
    'Insectile Aberration'
  );

  // The badge uses the current face's P/T: 3/2 + 1.
  await face.click({ button: 'right' });
  await menuItem(board, 'Add +1/+1 counter').click();
  await expect(face.getByTestId('pt-badge')).toHaveText('4/3');
});

test('a face-down permanent shows a 2/2 back and never leaks', async () => {
  const id = await putOnField('Grizzly Bears', { x: 620, y: 60 });
  const face = cardFace(id);
  await face.click({ button: 'right' });
  await menuItem(board, 'Turn face down').click();

  await expect(face).toHaveAttribute('data-face-down', 'true');
  await expect(face).not.toHaveAttribute('data-card-name');
  await expect(face.locator('img')).toHaveAttribute('alt', 'Face-down card');
  await expect(face.getByTestId('pt-badge')).toHaveText('2/2');

  // Neither the board's view nor its DOM names the card; the owner can
  // still peek at it in the private hand window.
  const { ref } = (await gameState()).cards[id];
  const view = JSON.stringify(
    await board.evaluate(() => window.api.getBoardView())
  );
  expect(view).not.toContain(ref.name);
  expect(view).not.toContain(ref.id);
  const html = await board.getByTestId('battlefield').innerHTML();
  expect(html).not.toContain(ref.name);
  expect(html).not.toContain(ref.id);
  await face.hover();
  await expect(board.getByTestId('card-preview')).toHaveCount(0);

  const peek = hand.getByTestId('face-down-peek');
  await expect(peek.locator(`[data-instance-id="${id}"]`)).toHaveAttribute(
    'data-card-name',
    'Grizzly Bears'
  );

  await face.click({ button: 'right' });
  await menuItem(board, 'Turn face up').click();
  await expect(face).toHaveAttribute('data-card-name', 'Grizzly Bears');
  await expect(peek).toHaveCount(0);
});

test('an attached card follows its host when the host is dragged', async () => {
  const host = await putOnField('Llanowar Elves', { x: 420, y: 360 });
  const aura = await putOnField('Forest', { x: 740, y: 360 });

  await cardFace(aura).click({ button: 'right' });
  await menuItem(board, 'Attach to…').click();
  const dialog = board.getByRole('dialog', { name: 'Attach to…' });
  await dialog.locator(`[data-instance-id="${host}"]`).click();
  await expect(dialog).toHaveCount(0);
  await expect(byId(aura)).toHaveAttribute('data-attached-to', host);

  let state = await gameState();
  const hostAt = state.cards[host].position!;
  const auraAt = state.cards[aura].position!;
  expect(state.cards[aura].attachedTo).toBe(host);
  expect(auraAt.y).toBeLessThan(hostAt.y);

  const box = await cardFace(host).boundingBox();
  if (!box) throw new Error('no host box');
  await board.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await board.mouse.down();
  await board.mouse.move(box.x + box.width / 2 + 100, box.y + 40, {
    steps: 10,
  });
  await board.mouse.move(
    box.x + box.width / 2 + 150,
    box.y + box.height / 2 - 60,
    {
      steps: 5,
    }
  );
  await board.mouse.up();

  await expect
    .poll(async () => (await gameState()).cards[host].position)
    .not.toEqual(hostAt);
  state = await gameState();
  const dx = state.cards[host].position!.x - hostAt.x;
  const dy = state.cards[host].position!.y - hostAt.y;
  expect(dx).not.toBe(0);
  expect(state.cards[aura].position).toEqual({
    x: auraAt.x + dx,
    y: auraAt.y + dy,
  });
  expect(state.cards[aura].attachedTo).toBe(host);
  await expect(byId(aura)).toHaveAttribute(
    'style',
    new RegExp(`translate\\(${auraAt.x + dx}px, ?${auraAt.y + dy}px\\)`)
  );
});

test('destroying a token removes it from the game', async () => {
  const graveyard = board.getByTestId('graveyard');
  await expect(graveyard).toHaveAttribute('data-count', '0');
  const tokens = board
    .getByTestId('battlefield')
    .locator('[data-token="true"]');
  const id = (await tokens.last().getAttribute('data-instance-id'))!;

  await tokens.last().click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();
  await expect(tokens).toHaveCount(1);
  await expect(graveyard).toHaveAttribute('data-count', '0');
  expect((await gameState()).cards[id]).toBeUndefined();
});

test('custom tokens, copies, and player counters', async () => {
  await (await battlefieldMenuItem(board, 'Create token…')).click();
  const dialog = board.getByRole('dialog', { name: 'Create token' });
  await dialog.getByRole('tab', { name: 'Custom token' }).click();
  await dialog.getByLabel('Name').fill('Zombie Army');
  await dialog.getByLabel('Power').fill('0');
  await dialog.getByLabel('Toughness').fill('0');
  await dialog.getByRole('button', { name: 'Create' }).click();
  const custom = board.getByTestId('battlefield').getByTestId('custom-token');
  await expect(custom).toHaveCount(1);
  await expect(custom).toContainText('Zombie Army');

  const before = await fieldCards().count();
  const delver = board
    .getByTestId('battlefield')
    .locator('[data-face-index="1"]')
    .first();
  await delver.click({ button: 'right' });
  await menuItem(board, 'Create copy').click();
  await expect(fieldCards()).toHaveCount(before + 1);

  const poison = board
    .getByTestId('player-counters')
    .locator('[data-counter="poison"]');
  await board.getByRole('button', { name: 'Add poison counter' }).click();
  await board.getByRole('button', { name: 'Add poison counter' }).click();
  await expect(poison).toHaveAttribute('data-count', '2');
  const view = await board.evaluate(() => window.api.getBoardView());
  expect(view?.counters).toEqual({ poison: 2 });
});

test('no renderer console errors', () => {
  // Card images come from the live Scryfall CDN through the cache.
  expect(errors).toEqual([]);
});
