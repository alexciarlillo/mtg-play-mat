import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { type FakeScryfall, startFakeScryfall } from './fakeScryfall';
import { clickGameMenu } from './gameMenu';

const ATRAXA = "Atraxa, Praetors' Voice";

const moxfieldExport = readFileSync(
  path.join(__dirname, '../src/main/decks/fixtures/moxfield-commander.txt'),
  'utf8'
);

test.describe.configure({ mode: 'serial' });

let scryfall: FakeScryfall;
let app: ElectronApplication;
let userDataDir: string;
const errors: string[] = [];

const windowFor = async (html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes(html))!;
  await page.waitForLoadState('load');
  return page;
};

test.beforeAll(async () => {
  scryfall = await startFakeScryfall();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-cmdr-'));
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_BULK_DATA_URL: scryfall.bulkDataUrl,
    },
  });
  const watch = (page: Page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
  };
  app.windows().forEach(watch);
  app.on('window', watch);
});

test.afterAll(async () => {
  await app?.close();
  scryfall?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

const commander = (board: Page) =>
  board
    .getByTestId('command-zone')
    .locator(`[data-testid="commander"][data-card-name="${ATRAXA}"]`);

const tax = (board: Page) => commander(board).getByTestId('commander-tax');

// The tax steps by a cast at a time, which is 2 mana.
const taxStep = (board: Page, more: boolean) =>
  board.getByRole('button', {
    name: `One cast ${more ? 'more' : 'less'} for ${ATRAXA}`,
  });

const onBattlefield = (board: Page) =>
  board
    .getByTestId('battlefield')
    .locator(`[data-testid="card"][data-card-name="${ATRAXA}"]`);

const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

test('a commander deck starts at 40 with its commander in command', async () => {
  const page = await windowFor('app.html');
  await expect(page.getByTestId('card-data-status')).toHaveAttribute(
    'data-phase',
    'idle'
  );

  const deckId = await page.evaluate(async (list) => {
    const report = await window.api.previewDeckImport(list);
    return window.api.createDeck({
      name: 'Atraxa Commander',
      format: report.format,
      cards: report.resolved.map((line) => ({
        printingId: line.printing.id,
        qty: line.qty,
        board: line.board,
      })),
    });
  }, moxfieldExport);
  await page.evaluate((id) => window.api.startPlayTest(id), deckId);

  const board = await windowFor('board.html');
  await expect(board.getByTestId('life')).toHaveText('40');
  await expect(commander(board)).toHaveAttribute('data-zone', 'command');
  await expect(commander(board).getByTestId('commander-badge')).toBeVisible();
  await expect(tax(board)).toContainText('Tax +0');
  await expect(board.getByTestId('command-zone')).toHaveAttribute(
    'data-count',
    '1'
  );
});

test('casting leaves the tax alone; the player steps it', async () => {
  const board = await windowFor('board.html');
  await commander(board).getByTestId('card').click();

  await expect(onBattlefield(board)).toHaveCount(1);
  await expect(
    onBattlefield(board).getByTestId('commander-badge')
  ).toBeVisible();
  await expect(tax(board)).toContainText('Tax +0');
  await expect(commander(board)).toHaveAttribute('data-zone', 'battlefield');
  await expect(board.getByTestId('command-zone')).toHaveAttribute(
    'data-count',
    '0'
  );

  // Never below zero, and one step per cast.
  await taxStep(board, false).click();
  await expect(tax(board)).toContainText('Tax +0');
  await taxStep(board, true).click();
  await expect(tax(board)).toContainText('Tax +2');
});

test('dying prompts a return to the command zone', async () => {
  const board = await windowFor('board.html');
  await onBattlefield(board).click({ button: 'right' });
  await menuItem(board, 'Move to graveyard').click();

  const prompt = board.getByRole('dialog', { name: 'Return to command zone?' });
  await expect(prompt).toContainText(`${ATRAXA} went to the graveyard`);

  // The prompt is held by main, so it survives a reload of the board.
  await board.reload();
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Yes' }).click();

  await expect(prompt).toHaveCount(0);
  await expect(commander(board)).toHaveAttribute('data-zone', 'command');
  await expect(board.getByTestId('graveyard')).toHaveAttribute(
    'data-count',
    '0'
  );
  await expect(tax(board)).toContainText('Tax +2');

  await commander(board).getByTestId('card').click();
  await expect(onBattlefield(board)).toHaveCount(1);
  await taxStep(board, true).click();
  await expect(tax(board)).toContainText('Tax +4');
});

test('the tax can be fixed by hand, and No keeps the card where it went', async () => {
  const board = await windowFor('board.html');
  await onBattlefield(board).click({ button: 'right' });
  await menuItem(board, 'Commander tax −2').click();
  await expect(tax(board)).toContainText('Tax +2');
  await onBattlefield(board).click({ button: 'right' });
  await menuItem(board, 'Commander tax +2').click();
  await expect(tax(board)).toContainText('Tax +4');

  await onBattlefield(board).click({ button: 'right' });
  await menuItem(board, 'Move to exile').click();
  const prompt = board.getByRole('dialog', { name: 'Return to command zone?' });
  await expect(prompt).toContainText('went to exile');
  await prompt.getByRole('button', { name: 'No' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(commander(board)).toHaveAttribute('data-zone', 'exile');
  await expect(board.getByTestId('exile')).toHaveAttribute('data-count', '1');

  // The flag survived: the engine still knows it is the commander.
  const flags = await app.evaluate(() => {
    const hooks = (
      globalThis as unknown as {
        testHooks: {
          gameState(): {
            cards: Record<
              string,
              { ref: { name: string }; isCommander?: boolean }
            >;
          };
        };
      }
    ).testHooks;
    return Object.values(hooks.gameState().cards)
      .filter((card) => card.isCommander)
      .map((card) => card.ref.name);
  });
  expect(flags).toEqual([ATRAXA]);

  // Back to the command zone by hand, from the exile browser.
  await board.getByRole('button', { name: 'Browse exile' }).click();
  await board
    .getByTestId('zone-browser')
    .getByTestId('card')
    .click({ button: 'right' });
  await menuItem(board, 'Move to command zone').click();
  await board.keyboard.press('Escape');
  await expect(commander(board)).toHaveAttribute('data-zone', 'command');
  await expect(tax(board)).toContainText('Tax +4');
});

test('a placeholder opponent tracks life and commander damage', async () => {
  const board = await windowFor('board.html');
  await expect(board.getByTestId('dummy')).toHaveCount(0);
  expect(await clickGameMenu(app, 'addDummy')).toBe(true);

  const dummy = board.getByTestId('dummy');
  await expect(dummy).toHaveAttribute('data-name', 'Opponent 1');
  await expect(dummy.getByTestId('dummy-life')).toHaveText('40');

  const more = dummy.getByRole('button', {
    name: `More commander damage from ${ATRAXA} to Opponent 1`,
  });
  for (let i = 0; i < 5; i += 1) await more.click();
  const damage = dummy.getByTestId('commander-damage');
  await expect(damage).toHaveAttribute('data-damage', '5');
  await expect(dummy.getByTestId('dummy-life')).toHaveText('35');
  await expect(damage).not.toHaveAttribute('data-lethal');

  for (let i = 0; i < 16; i += 1) await more.click();
  await expect(damage).toHaveAttribute('data-damage', '21');
  await expect(damage).toHaveAttribute('data-lethal', 'true');
  await expect(damage).toContainText('21+ lethal');
  await expect(dummy.getByTestId('dummy-life')).toHaveText('19');

  // The player's own life is untouched.
  await expect(board.getByTestId('life')).toHaveText('40');

  await dummy.getByRole('button', { name: 'Opponent 1 loses 5 life' }).click();
  await expect(dummy.getByTestId('dummy-life')).toHaveText('14');
  await dummy.getByRole('button', { name: 'Remove Opponent 1' }).click();
  await expect(board.getByTestId('dummy')).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
