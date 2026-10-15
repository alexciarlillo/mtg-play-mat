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
const nameOf = (state: GameState, id: string) => state.cards[id].ref.name;
const isLand = (state: GameState, id: string) =>
  /\bLand\b/.test(state.cards[id].ref.typeLine);

const lines = () => board.getByTestId('log-entry');
const revealPanel = () => board.getByTestId('reveal-panel');
const revealed = () => revealPanel().getByTestId('card');

const libraryMenu = async (item: string) => {
  await board.getByTestId('library').click({ button: 'right' });
  await board.getByRole('menuitem', { name: item, exact: true }).click();
};

const undo = async () => {
  const before = (await gameState()).log.length;
  await hand.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(before - 1);
};

const topName = async () => {
  const state = await gameState();
  return nameOf(state, me(state).zones.library[0]!);
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-reveal-'));
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

test('a cascade reveals to the first nonland: hit to hand, rest to a random bottom', async () => {
  // Two lands on top, so the cascade has to reveal past them.
  const setup = await gameState();
  const lands = me(setup)
    .zones.library.filter((id) => isLand(setup, id))
    .slice(0, 2);
  for (const instanceId of lands) {
    await hand.evaluate(
      (id) =>
        window.api.dispatch({
          type: 'moveCard',
          instanceId: id,
          to: 'library',
          index: 0,
        }),
      instanceId
    );
  }
  const start = await gameState();
  const lib = me(start).zones.library;
  const at = lib.findIndex((id) => !isLand(start, id));
  expect(at).toBeGreaterThanOrEqual(2);
  const hit = lib[at]!;
  const rest = lib.slice(0, at);

  await libraryMenu('Reveal until…');
  const dialog = hand.getByTestId('reveal-until');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(board.getByTestId('library-activity')).toHaveAttribute(
    'data-kind',
    'reveal'
  );
  await expect(board.getByTestId('library-activity')).toHaveAttribute(
    'title',
    'Revealing cards…'
  );
  await expect(lines().last()).toContainText(
    'is revealing cards from the top of their library'
  );

  // Space reveals one card to the table.
  await hand.keyboard.press('Space');
  await expect(revealed()).toHaveCount(1);
  await expect(revealed().first()).toHaveAttribute(
    'data-card-name',
    nameOf(start, lib[0]!)
  );
  await expect(lines().last()).toContainText(
    `revealed the top card of their library: ${nameOf(start, lib[0]!)}`
  );

  // 3 stops at a nonland card; A reveals up to it in one step.
  await hand.keyboard.press('3');
  const auto = hand.getByRole('button', { name: /Reveal until a hit/ });
  await expect(auto).toBeEnabled();
  await hand.keyboard.press('a');
  await expect(revealed()).toHaveCount(at + 1);
  await expect(revealed().last()).toHaveAttribute(
    'data-card-name',
    nameOf(start, hit)
  );
  await expect(lines().last()).toContainText(
    `(${at + 1} so far): ${lib
      .slice(1, at + 1)
      .map((id) => nameOf(start, id))
      .join(', ')}`
  );
  await expect(hand.getByTestId('reveal-until-status')).toContainText(
    `Hit: ${nameOf(start, hit)}`
  );
  // The board shows only the revealed cards, never the dialog.
  await expect(board.getByTestId('reveal-until')).toHaveCount(0);

  const shown = await gameState();
  const linesBefore = await lines().count();
  await hand.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await gameState()).log.length)
    .toBe(shown.log.length + 1);
  const done = await gameState();
  expect(done.log.at(-1)).toMatchObject({
    type: 'arrangeTop',
    hand: [hit],
    bottomRandom: true,
  });
  expect(me(done).zones.hand).toContain(hit);
  expect([...me(done).zones.library.slice(-rest.length)].sort()).toEqual(
    [...rest].sort()
  );
  await expect(revealPanel()).toHaveCount(0);
  await expect(board.getByTestId('library-activity')).toHaveCount(0);
  await expect(lines()).toHaveCount(linesBefore + 1);
  await expect(lines().last()).toContainText(
    `finished revealing ${at + 1} cards from their library: ` +
      `${rest.length} on the bottom in a random order, a card into their hand`
  );

  // One undo takes back the finish and shows the cards again; the next
  // takes back the reveal up to the hit.
  await undo();
  const back = await gameState();
  expect(back.players).toEqual(shown.players);
  expect(back.cards).toEqual(shown.cards);
  await expect(revealed()).toHaveCount(at + 1);
  await undo();
  await expect(revealed()).toHaveCount(1);
  await revealPanel().getByRole('button', { name: 'Hide' }).click();
  await expect(revealPanel()).toHaveCount(0);
});

test('the top card played revealed shows on the board and follows the library', async () => {
  const pile = board.getByTestId('library-top-card').getByTestId('card');
  await expect(pile).toHaveCount(0);

  await libraryMenu('Play with the top card revealed');
  await expect(pile).toHaveAttribute('data-card-name', await topName());
  await expect(lines().last()).toContainText(
    'started playing with the top card of their library revealed'
  );

  // A draw (clicking the pile still draws) and a shuffle both move it on.
  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect
    .poll(async () => (await gameState()).log.at(-1)?.type)
    .toBe('draw');
  await expect(pile).toHaveAttribute('data-card-name', await topName());
  await libraryMenu('Shuffle library');
  await expect
    .poll(async () => (await gameState()).log.at(-1)?.type)
    .toBe('shuffle');
  await expect(pile).toHaveAttribute('data-card-name', await topName());

  // A reveal comes and goes; the top card stays.
  await libraryMenu('Reveal the top card');
  await expect(revealed()).toHaveCount(1);
  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect(revealPanel()).toHaveCount(0);
  await expect(pile).toHaveAttribute('data-card-name', await topName());

  await libraryMenu('Stop playing with the top card revealed');
  await expect(board.getByTestId('library-top-card')).toHaveCount(0);
  // The toggle is an action like any other, so undo turns it back on.
  await undo();
  await expect(pile).toHaveAttribute('data-card-name', await topName());
  await libraryMenu('Stop playing with the top card revealed');
  await expect(board.getByTestId('library-top-card')).toHaveCount(0);
});

test('always looking at the top card shows it in the hand window only', async () => {
  const peek = hand.getByTestId('own-top-card').getByTestId('card');
  await expect(peek).toHaveCount(0);
  const logged = await lines().count();

  await libraryMenu('Always look at the top card');
  await expect(peek).toHaveAttribute('data-card-name', await topName());
  await expect(board.getByTestId('own-top-card')).toHaveCount(0);
  await expect(board.getByTestId('library-top-card')).toHaveCount(0);
  // Private: no action, no log line, nothing for the table.
  await expect(lines()).toHaveCount(logged);

  await board.getByRole('button', { name: 'Draw a card' }).click();
  await expect(peek).toHaveAttribute('data-card-name', await topName());

  // A new game starts with it off again.
  await board.evaluate(() => window.api.restartPlayTest());
  await expect(hand.getByTestId('own-top-card')).toHaveCount(0);
  await board.getByTestId('library').click({ button: 'right' });
  await expect(
    board.getByRole('menuitem', { name: 'Always look at the top card' })
  ).toBeVisible();
  await board.keyboard.press('Escape');

  // Only the play test windows may turn it on.
  const appWindow = await windowByPage('app.html');
  await expect(
    appWindow.evaluate(() => window.api.setLookAtTop(true))
  ).rejects.toThrow(/untrusted sender/);
});

test('mouse clicks leave Space and Enter to the dialog', async () => {
  await libraryMenu('Reveal until…');
  const dialog = hand.getByTestId('reveal-until');
  await expect(dialog).toBeFocused();
  const settle = async (count: number) => {
    await expect(revealed()).toHaveCount(count);
    await expect(dialog).toHaveAttribute('data-count', String(count));
  };

  // Space after clicking "Reveal next" reveals one more, not two.
  await hand.getByRole('button', { name: /Reveal next/ }).click();
  await settle(1);
  await hand.keyboard.press('Space');
  await settle(2);

  // Space after clicking "Reveal until a hit" is still just one more,
  // even straight after typing in the query field.
  await hand.getByRole('button', { name: /A card matching/ }).click();
  await hand.getByLabel('Stop at a card matching').fill('t:creature');
  await expect(hand.getByLabel('Stop at a card matching')).toBeFocused();
  const auto = hand.getByRole('button', { name: /Reveal until a hit/ });
  await expect(auto).toBeEnabled();
  await auto.click();
  await expect(dialog).toBeFocused();
  await expect
    .poll(async () => Number(await dialog.getAttribute('data-count')))
    .toBeGreaterThan(2);
  const n = Number(await dialog.getAttribute('data-count'));
  await settle(n);
  await hand.keyboard.press('Space');
  await settle(n + 1);

  // Clicking a card makes it the hit; Enter then finishes, not re-clicks.
  const before = await gameState();
  const tiles = hand.getByTestId('reveal-until-card');
  const pick = await tiles.evaluateAll((els) =>
    els.findIndex((el) => !el.hasAttribute('data-hit'))
  );
  expect(pick).toBeGreaterThanOrEqual(0);
  const chosen = me(before).zones.library[pick]!;
  await tiles.nth(pick).click();
  await expect(tiles.nth(pick)).toHaveAttribute('data-hit', 'true');
  await hand.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await gameState()).log.at(-1))
    .toMatchObject({ type: 'arrangeTop', hand: [chosen] });
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
