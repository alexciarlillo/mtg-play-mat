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

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
}

// One profile across two launches, so the second one proves the settings
// were saved.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let userDataDir: string;
let settingsFile: string;
const errors: string[] = [];

const launch = async () => {
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
};

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
    ).testHooks.openSamplePlayTest(3)
  );

const openSettings = async () => {
  const page = await windowByPage('app.html');
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page).toHaveURL(/#\/settings/);
  return page;
};

const turnToggle = (page: Page) => page.getByLabel(/Track turns and phases/);

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-set-'));
  settingsFile = path.join(userDataDir, 'settings.json');
  // The file an older version wrote: only a display name.
  writeFileSync(settingsFile, JSON.stringify({ displayName: 'Legacy' }));
  await launch();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('an old settings file keeps its name and turn tracking is off', async () => {
  const page = await openSettings();
  await expect(page.getByLabel('Your name')).toHaveValue('Legacy');
  await expect(turnToggle(page)).not.toBeChecked();

  await openSamplePlayTest();
  const board = await windowByPage('board.html');
  await expect(board.getByTestId('library')).toBeVisible();
  await expect(board.getByTestId('turn-panel')).toHaveCount(0);
});

test('toggling the setting shows and hides turn tracking live', async () => {
  const page = await openSettings();
  const board = await windowByPage('board.html');

  await turnToggle(page).check();
  await expect(board.getByTestId('turn-panel')).toBeVisible();
  await expect(board.getByTestId('turn')).toHaveText('1');

  await turnToggle(page).uncheck();
  await expect(board.getByTestId('turn-panel')).toHaveCount(0);

  await turnToggle(page).check();
  await expect(board.getByTestId('turn-panel')).toBeVisible();
  await expect
    .poll(() => JSON.parse(readFileSync(settingsFile, 'utf8')) as unknown)
    .toEqual({ displayName: 'Legacy', turnTracking: true });
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});

test('the setting survives a restart', async () => {
  await app.close();
  await launch();
  const page = await openSettings();
  await expect(turnToggle(page)).toBeChecked();
  await expect(page.getByLabel('Your name')).toHaveValue('Legacy');

  await openSamplePlayTest();
  const board = await windowByPage('board.html');
  await expect(board.getByTestId('turn-panel')).toBeVisible();
  expect(errors).toEqual([]);
});
