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

// One app instance, one picture: the mat is imported through the real
// image pipeline in main and drawn on the board.
test.describe.configure({ mode: 'serial' });

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  chooseMatFile(file: string): void;
}

type Hooks = { testHooks: TestHooks };

let app: ElectronApplication;
let userDataDir: string;
let appPage: Page;
let board: Page;
const errors: string[] = [];

// Any PNG will do; this one ships with the repo.
const PICTURE = path.resolve('assets/icon.png');

const windowByPage = async (html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes(html));
  if (!page) throw new Error(`no ${html} window`);
  await page.waitForLoadState('load');
  return page;
};

const choose = async (file: string) => {
  await app.evaluate(
    (_electron, picture) =>
      (globalThis as unknown as Hooks).testHooks.chooseMatFile(picture),
    file
  );
  await appPage.getByRole('button', { name: /Choose an? .*image…/ }).click();
};

const mat = () => board.getByTestId('play-mat');

// The field scales itself from a ResizeObserver, so a measurement taken
// the instant the window changes can catch it mid-flight.
const settled = async () => {
  const field = board.getByTestId('battlefield');
  let last: string | null = null;
  await expect
    .poll(async () => {
      const now = await field.getAttribute('data-scale');
      const stable = now !== null && now === last;
      last = now;
      return stable;
    })
    .toBe(true);
};

// The mat and one card, measured against each other rather than against
// the window: both numbers hold whatever the field is scaled to.
const geometry = async () => {
  await settled();
  const matBox = await mat().boundingBox();
  const cardBox = await board
    .getByTestId('battlefield')
    .getByTestId('card')
    .first()
    .boundingBox();
  if (!matBox || !cardBox) throw new Error('nothing to measure');
  return {
    aspect: matBox.width / matBox.height,
    // How much of the mat one card covers.
    perCard: matBox.width / cardBox.width,
    // Where on the art the card sits, as a fraction of the mat.
    onMat: {
      x: (cardBox.x - matBox.x) / matBox.width,
      y: (cardBox.y - matBox.y) / matBox.height,
    },
  };
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-mat-'));
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

  appPage = await windowByPage('app.html');
  await app.evaluate(() =>
    (globalThis as unknown as Hooks).testHooks.openSamplePlayTest(3)
  );
  board = await windowByPage('board.html');
  await board.getByRole('button', { name: 'Keep' }).click();
  await board.getByTestId('hand-tray').getByTestId('card').first().click();
  await expect(
    board.getByTestId('battlefield').getByTestId('card')
  ).toHaveCount(1);

  await appPage.getByRole('link', { name: 'Settings' }).first().click();
  await expect(appPage).toHaveURL(/#\/settings/);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('the table is bare until a picture is chosen', async () => {
  await expect(mat()).toHaveCount(0);
  await expect(appPage.getByTestId('mat-preview')).toHaveText('Bare table');
});

test('a chosen picture reaches the board as a playmat', async () => {
  await choose(PICTURE);

  const preview = appPage.getByTestId('mat-preview');
  await expect(preview).toHaveAttribute('data-mat', /^[0-9a-f]{64}$/, {
    timeout: 15_000,
  });
  const id = await preview.getAttribute('data-mat');
  // The same mat, by the same name, in the other window.
  await expect(mat()).toHaveAttribute('data-mat', id ?? '');
});

test('it keeps its shape and its place among the cards at any size', async () => {
  await board.setViewportSize({ width: 1500, height: 900 });
  const wide = await geometry();
  await board.setViewportSize({ width: 1000, height: 620 });
  const small = await geometry();

  // A 24x14 playmat, whatever the window does.
  expect(wide.aspect).toBeCloseTo(24 / 14, 2);
  expect(small.aspect).toBeCloseTo(24 / 14, 2);
  // It scales with the cards rather than being re-cropped, so the card
  // covers the same share of the mat and sits on the same patch of art.
  expect(small.perCard).toBeCloseTo(wide.perCard, 1);
  expect(small.onMat.x).toBeCloseTo(wide.onMat.x, 2);
  expect(small.onMat.y).toBeCloseTo(wide.onMat.y, 2);
});

test('removing it puts the bare table back', async () => {
  await appPage.getByRole('button', { name: 'Remove' }).click();
  await expect(appPage.getByTestId('mat-preview')).toHaveText('Bare table');
  await expect(mat()).toHaveCount(0);
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
