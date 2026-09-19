import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// One board across the tests: each builds on where the last left the
// panel, and reloads prove the placement is read back from settings.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let userDataDir: string;
let settingsFile: string;
let board: Page;
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

const panel = () => board.getByTestId('table-panel');
const handle = () => board.getByTestId('table-panel-handle');

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  return box;
};

// The positioned area the panel floats in: the field left of the side
// panel (and below opponents, in a duel).
const roomOf = () =>
  panel().evaluate((el) => {
    const r = (el.parentElement as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

const expectInside = (inner: Box, outer: Box) => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
};

const savedPanel = () =>
  (
    JSON.parse(readFileSync(settingsFile, 'utf8')) as {
      tablePanel?: { x: number; y: number; collapsed: boolean };
    }
  ).tablePanel;

const dragHandleBy = async (dx: number, dy: number) => {
  const box = await boxOf(handle());
  // Grab the title, clear of the collapse button at the right end.
  const x = box.x + 20;
  const y = box.y + box.height / 2;
  await board.mouse.move(x, y);
  await board.mouse.down();
  await board.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await board.mouse.move(x + dx, y + dy, { steps: 5 });
  await board.mouse.up();
};

const reloadBoard = async () => {
  await board.reload();
  await board.waitForLoadState('load');
  await expect(panel()).toBeVisible();
};

test.beforeAll(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'mtg-play-mat-e2e-panel-'));
  settingsFile = path.join(userDataDir, 'settings.json');
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

  // Test hooks exist once main has finished starting up.
  await windowByPage('app.html');
  await app.evaluate(() =>
    (
      globalThis as unknown as { testHooks: TestHooks }
    ).testHooks.openSamplePlayTest(3)
  );
  board = await windowByPage('board.html');
  await expect(board.getByTestId('library')).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('a solo board shows the table panel with its log and dice', async () => {
  await expect(panel()).toBeVisible();
  await expect(board.getByTestId('log-entry').first()).toContainText(
    'started a new game'
  );
  await board.evaluate(() =>
    (
      window as unknown as {
        api: { netRoll(request: unknown): Promise<void> };
      }
    ).api.netRoll({ type: 'die', sides: 6 })
  );
  await expect(board.getByTestId('table-event')).toHaveCount(1);

  // It starts in the bottom-right corner of the field. The panel re-clamps
  // a frame after the roll makes it taller, so let the layout settle.
  await expect(async () => {
    const room = await roomOf();
    const box = await boxOf(panel());
    expectInside(box, room);
    expect(room.x + room.width - (box.x + box.width)).toBeLessThan(20);
    expect(room.y + room.height - (box.y + box.height)).toBeLessThan(20);
  }).toPass({ timeout: 2000 });
});

test('dragging the handle moves the panel and it stays put', async () => {
  const before = await boxOf(panel());
  await dragHandleBy(-300, -200);
  const after = await boxOf(panel());
  expect(after.x).toBeCloseTo(before.x - 300, 0);
  expect(after.y).toBeCloseTo(before.y - 200, 0);

  await expect.poll(() => savedPanel()?.x ?? 1).toBeLessThan(1);
  const saved = savedPanel();
  expect(saved?.y).toBeLessThan(1);
  expect(saved?.collapsed).toBe(false);

  await reloadBoard();
  const reloaded = await boxOf(panel());
  expect(reloaded.x).toBeCloseTo(after.x, 0);
  expect(reloaded.y).toBeCloseTo(after.y, 0);
});

test('a drag past the edge stops at the field', async () => {
  await dragHandleBy(-5000, -5000);
  const room = await roomOf();
  const box = await boxOf(panel());
  expectInside(box, room);
  expect(box.x - room.x).toBeLessThan(20);
  expect(box.y - room.y).toBeLessThan(20);
  await expect.poll(() => savedPanel()).toMatchObject({ x: 0, y: 0 });
});

test('the old bottom-right spot is battlefield again', async () => {
  const room = await roomOf();
  const hit = await board.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-testid]')
        ?.getAttribute('data-testid'),
    { x: room.x + room.width - 60, y: room.y + room.height - 60 }
  );
  expect(hit).toBe('battlefield');
});

test('collapsing folds it to a chip that survives a reload', async () => {
  const room = await roomOf();
  await board.getByRole('button', { name: 'Collapse Table' }).click();
  await expect(board.getByTestId('table-log')).toHaveCount(0);
  await expect(panel()).toHaveAttribute('data-collapsed', 'true');
  const chip = await boxOf(panel());
  expect(chip.width).toBeLessThan(200);
  expectInside(chip, room);
  await expect.poll(() => savedPanel()?.collapsed).toBe(true);

  await reloadBoard();
  await expect(panel()).toHaveAttribute('data-collapsed', 'true');
  await board.getByRole('button', { name: 'Expand Table' }).click();
  await expect(board.getByTestId('table-log')).toBeVisible();
  await expect.poll(() => savedPanel()?.collapsed).toBe(false);
});

test('the panel stays inside the field when the window shrinks', async () => {
  // Park it bottom-right, then shrink the window under it.
  await dragHandleBy(5000, 5000);
  await expect.poll(() => savedPanel()).toMatchObject({ x: 1, y: 1 });
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('board.html')
    );
    win?.setSize(900, 600);
  });
  await expect
    .poll(async () => {
      const room = await roomOf();
      const box = await boxOf(panel());
      return (
        box.x + box.width <= room.x + room.width &&
        box.y + box.height <= room.y + room.height
      );
    })
    .toBe(true);
  expectInside(await boxOf(panel()), await roomOf());
});

test('no renderer console errors', () => {
  expect(errors).toEqual([]);
});
