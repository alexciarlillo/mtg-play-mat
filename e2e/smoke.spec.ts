import { mkdtempSync, rmSync } from 'node:fs';
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

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
}

// One app instance is shared, and later steps depend on earlier ones.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let userDataDir: string;
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

const openSamplePlayTest = (seed?: number) =>
  app.evaluate(
    (_electron, s) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.openSamplePlayTest(s),
    seed
  );

// A closing window can still be listed after its webContents is destroyed,
// so skip those instead of letting getURL throw.
const windowUrls = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed())
      .map((w) => w.webContents.getURL())
  );

const closeWindow = (html: string) =>
  app.evaluate(({ BrowserWindow }, name) => {
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed())
      .find((w) => w.webContents.getURL().includes(name))
      ?.close();
  }, html);

const cards = (page: Page) => page.locator('[data-testid="card"]');
const battlefield = (board: Page) =>
  board.getByTestId('battlefield').getByTestId('card');
const handCards = (hand: Page) => hand.getByTestId('hand').getByTestId('card');
const library = (board: Page) => board.getByTestId('library');
const pile = (board: Page, zone: 'graveyard' | 'exile' | 'hand-count') =>
  board.getByTestId(zone);
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

const instanceIds = (locator: Locator) =>
  locator.evaluateAll((els) => els.map((el) => el.dataset.instanceId));

// A new game starts with an opening hand of seven from the 60-card deck.
const keepDrawAndPlay = async () => {
  const board = await windowByPage('board.html');
  const hand = await windowByPage('hand.html');

  await expect(library(board)).toHaveAttribute('data-count', '53');
  await expect(handCards(hand)).toHaveCount(7);
  await hand.getByRole('button', { name: 'Keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);

  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect(library(board)).toHaveAttribute('data-count', '52');
  await expect(handCards(hand)).toHaveCount(8);

  await handCards(hand).first().click();
  await expect(handCards(hand)).toHaveCount(7);
  await expect(battlefield(board)).toHaveCount(1);

  return { board, hand };
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-'));
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
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('app window loads with an empty deck list', async () => {
  const appWindow = await windowByPage('app.html');

  await expect(appWindow.getByText('Add a new deck')).toBeVisible();
  // Test hooks skip the launch check, so no real bulk download starts.
  const cardData = appWindow.getByTestId('card-data-status');
  await expect(cardData).toContainText('No card data yet');
  await expect(cardData).toHaveAttribute('data-phase', 'idle');
  await appWindow.getByText('Collection').first().click();
  await expect(appWindow).toHaveURL(/#\/collection/);

  expect(await windowUrls()).toHaveLength(1);
});

test('window.api is a narrow typed bridge', async () => {
  const appWindow = await windowByPage('app.html');

  const surface = await appWindow.evaluate(() => {
    const api = window.api as unknown as Record<string, unknown>;
    const global = window as unknown as Record<string, unknown>;
    return {
      keys: Object.keys(api).sort(),
      allFunctions: Object.values(api).every((v) => typeof v === 'function'),
      hasRequire: typeof global.require,
      hasProcess: typeof global.process,
    };
  });

  expect(surface.keys).toEqual(
    [
      'deleteDeck',
      'dispatch',
      'getBoardView',
      'getHandView',
      'importDeck',
      'listDecks',
      'listSets',
      'getCardDataStatus',
      'onBoardView',
      'onCardDataStatus',
      'onHandView',
      'restartPlayTest',
      'updateCardData',
      'searchCards',
      'startPlayTest',
    ].sort()
  );
  expect(surface.allFunctions).toBe(true);
  for (const generic of ['send', 'on', 'once', 'invoke', 'ipcRenderer']) {
    expect(surface.keys).not.toContain(generic);
  }
  expect(surface.hasRequire).toBe('undefined');
  expect(surface.hasProcess).toBe('undefined');

  await expect(
    appWindow.locator('meta[http-equiv="Content-Security-Policy"]')
  ).toHaveAttribute('content', /default-src 'self'/);

  // Requests round-trip to main; a missing card database yields empty data.
  expect(await appWindow.evaluate(() => window.api.listDecks())).toEqual([]);

  // keyrune is bundled locally, so its font loads under the CSP.
  const keyruneFaces = await appWindow.evaluate(
    async () => (await document.fonts.load('16px Keyrune')).length
  );
  expect(keyruneFaces).toBeGreaterThan(0);
});

test('play test opens, reuses, closes as a pair, and reopens', async () => {
  await openSamplePlayTest();
  const { board } = await keepDrawAndPlay();

  // Tap by clicking the card itself: its wrapper has a real hitbox now.
  const card = battlefield(board);
  const wrapper = board.getByTestId('battlefield-card');
  const box = await wrapper.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  expect(box?.height).toBeGreaterThan(100);
  await card.click();
  await expect(card).toHaveClass(/rotate-90/);

  await card.click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();
  await expect(pile(board, 'graveyard')).toHaveAttribute('data-count', '1');
  await expect(battlefield(board)).toHaveCount(0);

  // Starting again while open reuses the windows and resets both.
  await board.getByRole('button', { name: 'Draw a card' }).click();
  await openSamplePlayTest();
  expect(await windowUrls()).toHaveLength(3);
  await keepDrawAndPlay();

  await closeWindow('board.html');
  await expect.poll(windowUrls).toHaveLength(1);

  await openSamplePlayTest();
  expect(await windowUrls()).toHaveLength(3);
  await keepDrawAndPlay();

  // The renderer path: a deck id that doesn't exist yields no cards.
  const appWindow = await windowByPage('app.html');
  await appWindow.evaluate(() => window.api.startPlayTest(1));
  const board2 = await windowByPage('board.html');
  await expect(library(board2)).toHaveAttribute('data-count', '0');

  await closeWindow('hand.html');
  await expect.poll(windowUrls).toHaveLength(1);
});

test('board and hand state survive window reloads', async () => {
  await openSamplePlayTest();
  const { board, hand } = await keepDrawAndPlay();

  const card = battlefield(board);
  const wrapper = board.getByTestId('battlefield-card');
  const id = await card.getAttribute('data-instance-id');

  // Drag the card, then tap it; both go to main as actions.
  const box = await wrapper.boundingBox();
  if (!box) throw new Error('battlefield card has no box');
  const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await board.mouse.move(grab.x, grab.y);
  await board.mouse.down();
  await board.mouse.move(grab.x + 120, grab.y + 60, { steps: 10 });
  await board.mouse.move(grab.x + 240, grab.y + 90, { steps: 10 });
  await board.mouse.up();
  await expect(wrapper).toHaveAttribute('style', /translate\(240px, ?90px\)/);
  await card.click();
  await expect(card).toHaveClass(/rotate-90/);

  // Two cards in hand to check that the hand also comes back intact.
  const draw = board.getByRole('button', { name: 'Draw a card' });
  await draw.click();
  await expect(library(board)).toHaveAttribute('data-count', '51');
  await draw.click();
  await expect(handCards(hand)).toHaveCount(9);
  const handIds = await instanceIds(handCards(hand));

  await board.reload();
  await expect(library(board)).toHaveAttribute('data-count', '50');
  await expect(battlefield(board)).toHaveCount(1);
  await expect(card).toHaveAttribute('data-instance-id', id ?? '');
  await expect(card).toHaveClass(/rotate-90/);
  await expect(wrapper).toHaveAttribute('style', /translate\(240px, ?90px\)/);

  await hand.reload();
  await expect(handCards(hand)).toHaveCount(9);
  expect(await instanceIds(handCards(hand))).toEqual(handIds);

  // The reloaded windows are still live views, not snapshots.
  await handCards(hand).first().click();
  await expect(handCards(hand)).toHaveCount(8);
  await expect(battlefield(board)).toHaveCount(2);
  await card.first().click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();
  await expect(pile(board, 'graveyard')).toHaveAttribute('data-count', '1');
  await expect(battlefield(board)).toHaveCount(1);

  // Main validates actions: a window cannot start a game or send junk.
  for (const bad of [
    { type: 'newGame', seed: 1, players: [] },
    { type: 'draw', playerId: 'p1', count: 'all' },
    { type: 'moveCard', instanceId: id, to: 'sideboard' },
  ]) {
    const result = await board.evaluate(
      (action) =>
        window.api.dispatch(action as never).then(
          () => 'accepted',
          (err: unknown) => String(err)
        ),
      bad
    );
    expect(result).toMatch(/invalid action/);
  }
  await expect(library(board)).toHaveAttribute('data-count', '50');

  await closeWindow('board.html');
  await expect.poll(windowUrls).toHaveLength(1);
});

test('goldfish: mulligan, keep, play, move, drag, life, untap, restart', async () => {
  await openSamplePlayTest(20260918);
  const board = await windowByPage('board.html');
  const hand = await windowByPage('hand.html');
  const status = board.getByTestId('mulligan-status');
  const life = board.getByTestId('life');

  // Opening hand of seven, not yet kept.
  await expect(handCards(hand)).toHaveCount(7);
  await expect(library(board)).toHaveAttribute('data-count', '53');
  await expect(pile(board, 'hand-count')).toHaveAttribute('data-count', '7');
  await expect(status).toHaveText(/Mulligans 0/);
  await expect(life).toHaveText('20');
  const firstHand = await instanceIds(handCards(hand));

  // Mulligan once: a fresh seven, and the count is public.
  await hand.getByRole('button', { name: 'Mulligan' }).click();
  await expect(status).toHaveText(/Mulligans 1/);
  await expect(hand.getByTestId('mulligan-bar')).toHaveText(/Mulligans 1/);
  await expect(handCards(hand)).toHaveCount(7);
  await expect(library(board)).toHaveAttribute('data-count', '53');
  expect(await instanceIds(handCards(hand))).not.toEqual(firstHand);

  // Keep and put one non-land on the bottom.
  await hand.getByRole('button', { name: 'Keep' }).click();
  const bottom = hand
    .getByTestId('hand')
    .locator('[data-testid="card"]:not([data-card-name="Forest"])')
    .first();
  const bottomId = await bottom.getAttribute('data-instance-id');
  await bottom.click();
  await hand.getByRole('button', { name: 'Bottom and keep' }).click();
  await expect(hand.getByTestId('mulligan-bar')).toHaveCount(0);
  await expect(status).toHaveCount(0);
  await expect(handCards(hand)).toHaveCount(6);
  await expect(library(board)).toHaveAttribute('data-count', '54');
  expect(await instanceIds(handCards(hand))).not.toContain(bottomId);

  // M does nothing once kept; D draws from either window.
  await board.keyboard.press('m');
  await board.keyboard.press('d');
  await expect(handCards(hand)).toHaveCount(7);
  await expect(library(board)).toHaveAttribute('data-count', '53');

  // Play a land and tap it.
  const forest = hand
    .getByTestId('hand')
    .locator('[data-card-name="Forest"]')
    .first();
  await forest.click();
  await expect(battlefield(board)).toHaveCount(1);
  const land = battlefield(board).first();
  await expect(land).toHaveAttribute('data-card-name', 'Forest');
  await land.click();
  await expect(land).toHaveClass(/rotate-90/);

  // Hover-zoom shows the board card on the board only.
  await land.hover();
  await expect(board.getByTestId('card-preview')).toBeVisible();
  await board.mouse.move(5, 5);
  await expect(board.getByTestId('card-preview')).toHaveCount(0);
  await hand.mouse.move(1, 1);
  await handCards(hand).last().hover();
  await expect(hand.getByTestId('card-preview')).toBeVisible();
  await expect(board.getByTestId('card-preview')).toHaveCount(0);

  // Play another card and send it to the graveyard from its menu.
  await handCards(hand).first().click();
  await expect(battlefield(board)).toHaveCount(2);
  const second = battlefield(board).nth(1);
  await second.click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();
  await expect(pile(board, 'graveyard')).toHaveAttribute('data-count', '1');
  await expect(battlefield(board)).toHaveCount(1);

  // The graveyard is browsable, with the same move actions.
  await board.getByRole('button', { name: 'Browse graveyard' }).click();
  const browser = board.getByRole('dialog', { name: 'Graveyard (1)' });
  await expect(browser.getByTestId('card')).toHaveCount(1);
  await board.keyboard.press('Escape');
  await expect(browser).toHaveCount(0);

  // Drag a third card from the battlefield onto the exile pile.
  await handCards(hand).first().click();
  await expect(battlefield(board)).toHaveCount(2);
  const third = board.getByTestId('battlefield-card').nth(1);
  const from = await third.boundingBox();
  const to = await pile(board, 'exile').boundingBox();
  if (!from || !to) throw new Error('missing drag boxes');
  await board.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await board.mouse.down();
  await board.mouse.move(from.x + 200, from.y + 50, { steps: 10 });
  await board.mouse.move(to.x + to.width / 2, to.y + to.height / 3, {
    steps: 10,
  });
  await board.mouse.up();
  await expect(pile(board, 'exile')).toHaveAttribute('data-count', '1');
  await expect(battlefield(board)).toHaveCount(1);

  // Life −3, then untap all.
  const lose = board.getByRole('button', { name: 'Lose 1 life' });
  for (let i = 0; i < 3; i += 1) await lose.click();
  await expect(life).toHaveText('17');
  await board.keyboard.press('u');
  await expect(land).not.toHaveClass(/rotate-90/);

  // Help overlay on ?.
  await board.keyboard.press('?');
  const help = board.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await board.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  // Nothing from the hand is in the board window.
  const handIds = await instanceIds(handCards(hand));
  const boardIds = await instanceIds(cards(board));
  expect(handIds.filter((id) => boardIds.includes(id))).toEqual([]);

  // Restart after confirming: a fresh game from the same deck.
  await board.getByRole('button', { name: 'Restart' }).click();
  await board
    .getByRole('dialog', { name: 'Restart game?' })
    .getByRole('button', { name: 'Restart' })
    .click();
  await expect(battlefield(board)).toHaveCount(0);
  await expect(pile(board, 'graveyard')).toHaveAttribute('data-count', '0');
  await expect(pile(board, 'exile')).toHaveAttribute('data-count', '0');
  await expect(library(board)).toHaveAttribute('data-count', '53');
  await expect(life).toHaveText('20');
  await expect(status).toHaveText(/Mulligans 0/);
  await expect(handCards(hand)).toHaveCount(7);

  await closeWindow('board.html');
  await expect.poll(windowUrls).toHaveLength(1);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});

test('closing the app window follows platform conventions', async () => {
  await windowByPage('app.html');
  const exited = new Promise<void>((resolve) => {
    app.process().once('exit', () => resolve());
  });
  await closeWindow('app.html');

  if (process.platform === 'darwin') {
    await expect.poll(windowUrls).toHaveLength(0);
    await app.evaluate(({ app: electronApp }) => {
      electronApp.emit('activate');
    });
    await windowByPage('app.html');
  } else {
    await exited;
  }
});
