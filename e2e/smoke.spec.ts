import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

interface TestHooks {
  openSamplePlayTest(): Promise<void>;
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

const openSamplePlayTest = () =>
  app.evaluate(() =>
    (
      globalThis as unknown as { testHooks: TestHooks }
    ).testHooks.openSamplePlayTest()
  );

const windowUrls = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getURL())
  );

const closeWindow = (html: string) =>
  app.evaluate(({ BrowserWindow }, name) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes(name))
      ?.close();
  }, html);

const cards = (page: Page) => page.locator('[data-testid="card"]');

const drawAndPlay = async () => {
  const board = await windowByPage('board.html');
  const hand = await windowByPage('hand.html');

  await expect(board.getByText('Cards: 20')).toBeVisible();
  await expect(cards(hand)).toHaveCount(0);

  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect(board.getByText('Cards: 19')).toBeVisible();
  await expect(cards(hand)).toHaveCount(1);

  await cards(hand).first().click();
  await expect(cards(hand)).toHaveCount(0);
  await expect(cards(board)).toHaveCount(1);

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
      'drawCard',
      'importDeck',
      'listDecks',
      'listSets',
      'onCardDrawn',
      'onCardPlayed',
      'onDeckLoaded',
      'playCard',
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
  const { board } = await drawAndPlay();

  // The draggable wrapper is zero-sized, so target the card face itself.
  const battlefieldCard = board.locator(
    '.w-4\\/5 [data-testid="card"] .handle'
  );
  await battlefieldCard.click();
  await expect(battlefieldCard).toHaveClass(/rotate-90/);
  await battlefieldCard.click({ button: 'right' });
  await board.getByRole('menuitem', { name: 'Destroy' }).click();
  await expect(cards(board)).toHaveCount(1);
  await expect(board.locator('.w-4\\/5 [data-testid="card"]')).toHaveCount(0);

  // Starting again while open reuses the windows and resets both.
  await board.getByRole('button', { name: 'Draw a card' }).click();
  await openSamplePlayTest();
  expect(await windowUrls()).toHaveLength(3);
  await drawAndPlay();

  await closeWindow('board.html');
  await expect.poll(windowUrls).toHaveLength(1);

  await openSamplePlayTest();
  expect(await windowUrls()).toHaveLength(3);
  await drawAndPlay();

  // The renderer path: with no deck database the deck is empty.
  const appWindow = await windowByPage('app.html');
  await appWindow.evaluate(() => window.api.startPlayTest(1));
  const board2 = await windowByPage('board.html');
  await expect(board2.getByText('Cards: 0')).toBeVisible();

  await closeWindow('hand.html');
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
