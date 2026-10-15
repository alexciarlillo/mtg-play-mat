import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import type { GameState, PlayerAction, UndoState } from '../src/shared/game';

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
  undoState(): UndoState;
}

type Hooks = { testHooks: TestHooks };

interface Saved {
  version: number;
}

// One profile across several launches, as a player quitting and coming
// back would have.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication | null = null;
let userDataDir: string;
let saveFile: string;
const errors: string[] = [];

const launch = async () => {
  const launched = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1' },
  });
  app = launched;
  const watch = (page: Page) => {
    const label = () => page.url().split('/').pop();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`${label()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`${label()}: ${err.message}`));
  };
  launched.windows().forEach(watch);
  launched.on('window', watch);
  return launched;
};

const quit = async () => {
  await app?.close();
  app = null;
};

const running = () => {
  if (!app) throw new Error('the app is not running');
  return app;
};

const windowByPage = async (html: string): Promise<Page> => {
  const electronApp = running();
  await expect
    .poll(() => electronApp.windows().some((w) => w.url().includes(html)))
    .toBe(true);
  const page = electronApp.windows().find((w) => w.url().includes(html));
  if (!page) throw new Error(`no ${html} window`);
  await page.waitForLoadState('load');
  return page;
};

const openSample = async (seed: number) => {
  await windowByPage('app.html');
  await running().evaluate(
    (_, s) => (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(s),
    seed
  );
  return {
    board: await windowByPage('board.html'),
    hand: await windowByPage('hand.html'),
  };
};

const gameState = () =>
  running().evaluate(() =>
    (globalThis as unknown as Hooks).testHooks.gameState()
  );

const undoState = () =>
  running().evaluate(() =>
    (globalThis as unknown as Hooks).testHooks.undoState()
  );

const withoutSeq = ({ seq: _seq, ...rest }: GameState) => rest;

// The local player's own lines in the table log, oldest first.
const ownLines = async (board: Page) => {
  const table = await board.evaluate(() => window.api.getOpponentView());
  return table.log.flatMap((entry) =>
    entry.kind === 'action' ? [entry.text] : []
  );
};

const dispatch = (page: Page, action: PlayerAction) =>
  page.evaluate((a) => window.api.dispatch(a), action);

const logLength = async (length: number) => {
  await expect.poll(async () => (await gameState()).log.length).toBe(length);
};

const restorePrompt = (board: Page) =>
  board.getByRole('dialog', { name: 'Restore saved game?' });

const failedPrompt = (board: Page) =>
  board.getByRole('dialog', { name: 'Saved game not restored' });

test.beforeAll(() => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-save-'));
  saveFile = path.join(userDataDir, 'saves', 'sample-constructed.json');
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: false })
  );
});

test.afterAll(async () => {
  await quit();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('a game quit mid-way comes back whole: board, log and undo history', async () => {
  await launch();
  const { board, hand } = await openSample(5);
  // Nothing was saved before, so nothing is offered.
  await expect(board.getByTestId('battlefield-card')).toHaveCount(0);
  await expect(restorePrompt(board)).toHaveCount(0);

  await hand.getByRole('button', { name: 'Keep' }).click();
  await logLength(4);
  const start = await gameState();
  const me = start.players[0];
  const [land, bear] = me.zones.hand;
  const [top, second] = me.zones.library;
  await dispatch(hand, {
    type: 'moveCard',
    instanceId: land,
    to: 'battlefield',
  });
  await dispatch(hand, { type: 'tap', instanceId: land });
  await dispatch(hand, {
    type: 'arrangeTop',
    playerId: me.id,
    top: [],
    bottom: [top, second],
    graveyard: [],
    exile: [],
    hand: [],
    bottomRandom: true,
  });
  await dispatch(hand, { type: 'moveCard', instanceId: bear, to: 'graveyard' });
  await logLength(8);
  await hand.getByRole('button', { name: 'Undo' }).click();
  await logLength(7);

  const before = await gameState();
  const undoBefore = await undoState();
  expect(undoBefore).toEqual({ canUndo: true, canRedo: true });
  const linesBefore = await ownLines(board);
  expect(linesBefore.at(-1)).toMatch(/^undid: /);
  await expect(board.getByTestId('battlefield-card')).toHaveCount(1);

  await quit();
  const saved = JSON.parse(readFileSync(saveFile, 'utf8')) as {
    version: number;
    appVersion: string;
    log: unknown[];
  };
  expect(saved.log).toHaveLength(7);
  expect(saved.version).toBe(1);
  expect(saved.appVersion).toMatch(/^\d+\.\d+\.\d+/);

  await launch();
  const again = await openSample(6);

  await expect(restorePrompt(again.board)).toBeVisible();
  await expect(restorePrompt(again.board)).toContainText('Sample deck');
  await restorePrompt(again.board)
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(restorePrompt(again.board)).toHaveCount(0);
  await logLength(7);

  // Player ids are new every launch, so the restored game has this
  // launch's; otherwise it is the same game.
  const after = await gameState();
  const was = before.players[0].id;
  const now = after.players[0].id;
  expect(now).not.toBe(was);
  const moved = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value).replaceAll(was, now));
  expect(withoutSeq(after)).toEqual(moved(withoutSeq(before)));
  expect(await undoState()).toEqual(undoBefore);
  await expect(again.board.getByTestId('battlefield-card')).toHaveCount(1);
  await expect(again.hand.getByRole('button', { name: 'Redo' })).toBeEnabled();
  const linesAfter = await ownLines(again.board);
  // The old lines come back in order and at their own times, so before
  // the new game's opening line; the restore's own line comes last.
  expect(linesAfter).toEqual([
    ...linesBefore,
    'started a new game',
    'restored a saved game',
  ]);

  // The redo stack survived: the bear goes back to the graveyard.
  await again.hand.getByRole('button', { name: 'Redo' }).click();
  await logLength(8);
  const bearNow = bear.replace(was, now);
  expect((await gameState()).cards[bearNow].zone).toBe('graveyard');
  expect(errors).toEqual([]);
});

test('a damaged save starts a new game, and says so', async () => {
  await quit();
  writeFileSync(saveFile, '{"kind":"mtg-play-mat/game","version":1,"log":[');

  await launch();
  const { board } = await openSample(7);
  await expect(failedPrompt(board)).toBeVisible();
  await expect(board.getByTestId('saved-game-error')).toContainText(
    /damaged.*A new game was started instead.*kept as .*unreadable\.json/
  );
  // Set aside, not written over by the new game.
  expect(
    readFileSync(saveFile.replace(/\.json$/, '.unreadable.json'), 'utf8')
  ).toBe('{"kind":"mtg-play-mat/game","version":1,"log":[');
  await expect(restorePrompt(board)).toHaveCount(0);
  const fresh = await gameState();
  expect(fresh.log).toHaveLength(3);
  expect(fresh.players[0].zones.hand).toHaveLength(7);
  await failedPrompt(board).getByRole('button', { name: 'OK' }).click();
  await expect(failedPrompt(board)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a save from another version starts a new game, and says so', async () => {
  await quit();
  writeFileSync(
    saveFile,
    JSON.stringify({
      kind: 'mtg-play-mat/game',
      version: 0,
      appVersion: '0.0.1',
      log: [],
    })
  );

  await launch();
  const { board, hand } = await openSample(8);
  await expect(board.getByTestId('saved-game-error')).toContainText(
    'version 0.0.1'
  );
  expect((await gameState()).log).toHaveLength(3);
  await failedPrompt(board).getByRole('button', { name: 'OK' }).click();

  // The new game replaces the file it couldn't use, and plays on.
  await hand.getByRole('button', { name: 'Keep' }).click();
  await logLength(4);
  const version = () => {
    try {
      return (JSON.parse(readFileSync(saveFile, 'utf8')) as Saved).version;
    } catch {
      return null;
    }
  };
  await expect.poll(version).toBe(1);
  const aside = saveFile.replace(/\.json$/, '.unreadable.json');
  expect((JSON.parse(readFileSync(aside, 'utf8')) as Saved).version).toBe(0);
  expect(errors).toEqual([]);
});
