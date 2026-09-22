import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { loadConfig } from '../server/config';
import { createRelayServer, type RelayServer } from '../server/server';
import { writeTestPng } from './makePng';

// Two app instances joined by a lobby code, through a real relay server
// running in this process. No WebRTC is involved at all.

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  chooseMatFile(file: string): void;
}

interface Instance {
  app: ElectronApplication;
  userDataDir: string;
  errors: string[];
}

const APP_ID = 'mtg-play-mat';
const APP_KEY = 'e2e-key';

test.describe.configure({ mode: 'serial' });

let relay: RelayServer;
let baseUrl: string;
let host: Instance;
let guest: Instance;

const launch = async (label: string): Promise<Instance> => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), `mtg-lobby-${label}-`));
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: true })
  );
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      MTG_PLAY_MAT_TEST_HOOKS: '1',
      MTG_PLAY_MAT_RELAY_URL: baseUrl,
      MTG_PLAY_MAT_RELAY_APP_ID: APP_ID,
      MTG_PLAY_MAT_RELAY_APP_KEY: APP_KEY,
    },
  });
  const errors: string[] = [];
  const watch = (page: Page) => {
    const name = () => `${label}/${page.url().split('/').pop()}`;
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`${name()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`${name()}: ${err.message}`));
  };
  app.windows().forEach(watch);
  app.on('window', watch);
  return { app, userDataDir, errors };
};

const page = async ({ app }: Instance, html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)), {
      timeout: 15_000,
    })
    .toBe(true);
  const found = app.windows().find((w) => w.url().includes(html));
  if (!found) throw new Error(`no ${html} window`);
  await found.waitForLoadState('load');
  return found;
};

const openPlayTest = ({ app }: Instance, seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.openSamplePlayTest(s),
    seed
  );

const online = async (instance: Instance, name: string) => {
  const app = await page(instance, 'app.html');
  await app.getByRole('link', { name: 'Settings' }).first().click();
  await app.getByLabel('Your name').fill(name);
  await app.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    app.getByRole('button', { name: 'Save', exact: true })
  ).toBeDisabled();
  await app.getByRole('link', { name: 'Play online' }).first().click();
  await expect(app).toHaveURL(/#\/online/);
  await expect(app.getByTestId('online-name')).toContainText(name);
  return app;
};

const status = (app: Page) => app.getByTestId('net-status');

test.beforeAll(async () => {
  relay = createRelayServer({
    ...loadConfig({ RELAY_APP_KEYS: `${APP_ID}:${APP_KEY}` }),
    host: '127.0.0.1',
    port: 0,
  });
  const { port } = await relay.listen();
  baseUrl = `http://127.0.0.1:${port}`;
  [host, guest] = await Promise.all([launch('host'), launch('guest')]);
});

test.afterAll(async () => {
  for (const instance of [host, guest]) {
    await instance?.app.close().catch(() => {});
    if (instance)
      rmSync(instance.userDataDir, { recursive: true, force: true });
  }
  await relay?.close();
});

test('the lobby tab is the one that opens', async () => {
  const hostApp = await online(host, 'Alice');
  await expect(
    hostApp.getByRole('tab', { name: 'Lobby code' })
  ).toHaveAttribute('aria-selected', 'true');
  // The relay came from the environment, so there is nothing to set up.
  await expect(hostApp.getByTestId('no-relay-notice')).toHaveCount(0);
});

test('a host gets a short code and a guest joins with it', async () => {
  const hostApp = await page(host, 'app.html');
  const guestApp = await online(guest, 'Bob');

  await hostApp.getByRole('button', { name: 'Host a game' }).click();
  const code = hostApp.getByTestId('lobby-code');
  await expect(code).toHaveText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/, {
    timeout: 15_000,
  });
  const shown = (await code.textContent()) ?? '';
  await expect(hostApp.getByTestId('seats-free')).toHaveText(
    '3 seats still free.'
  );

  // Typed the way it was read out, dash and all.
  await guestApp.getByRole('button', { name: 'Join a game' }).click();
  await guestApp.getByRole('textbox', { name: 'Lobby code' }).fill(shown);
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(status(hostApp)).toHaveAttribute('data-phase', 'connected', {
    timeout: 20_000,
  });
  await expect(status(guestApp)).toHaveAttribute('data-phase', 'connected');
  await expect(status(hostApp)).toHaveText(/Connected to Bob/);
  await expect(status(guestApp)).toHaveText(/Connected to Alice/);
  await expect(hostApp.getByTestId('seat-2')).toContainText('Seat 2: Bob');
  await expect(hostApp.getByTestId('seats-free')).toHaveText(
    '2 seats still free.'
  );

  // A live session pins the tab, so nobody switches mode mid-game.
  await expect(
    guestApp.getByRole('tab', { name: 'Invite codes' })
  ).toBeDisabled();
});

test('each board shows the other side through the relay', async () => {
  await Promise.all([openPlayTest(host, 1111), openPlayTest(guest, 2222)]);
  const [hostBoard, guestBoard] = await Promise.all([
    page(host, 'board.html'),
    page(guest, 'board.html'),
  ]);

  await expect(guestBoard.getByTestId('opponent-name')).toHaveText('Alice');
  await expect(hostBoard.getByTestId('opponent-name')).toHaveText('Bob');
  await expect(guestBoard.getByTestId('opponent-library')).toHaveAttribute(
    'data-count',
    '53'
  );

  // A card played on one board reaches the other, over the relay.
  await hostBoard.getByRole('button', { name: 'Keep' }).click();
  const hand = hostBoard.getByTestId('hand').getByTestId('card');
  await expect(hand).toHaveCount(7);
  await hand.first().click();
  await expect(
    guestBoard.getByTestId('opponent-battlefield').getByTestId('card')
  ).toHaveCount(1);
});

test('a play area background fits through the relay', async () => {
  const hostApp = await page(host, 'app.html');
  const guestBoard = await page(guest, 'board.html');
  // Big enough that the mat message is most of what a relay frame can
  // hold: the point of the test is that it still gets through.
  const picture = path.join(host.userDataDir, 'mat.png');
  writeTestPng(picture, 2400, 1400);

  await hostApp.getByRole('link', { name: 'Settings' }).first().click();
  await host.app.evaluate(
    (_electron, file) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.chooseMatFile(file),
    picture
  );
  await hostApp.getByRole('button', { name: /Choose an? .*image…/ }).click();

  const preview = hostApp.getByTestId('mat-preview');
  await expect(preview).toHaveAttribute('data-mat', /^[0-9a-f]{64}$/, {
    timeout: 20_000,
  });
  const id = await preview.getAttribute('data-mat');
  await expect(guestBoard.getByTestId('opponent-play-mat')).toHaveAttribute(
    'data-mat',
    id ?? '',
    { timeout: 20_000 }
  );
  // The share copy is what its name is the hash of, and it is the one
  // that had to fit.
  const shared = path.join(host.userDataDir, 'mats', `${id ?? ''}.jpg`);
  expect(statSync(shared).size).toBeLessThanOrEqual(180 * 1024);
  expect(statSync(shared).size).toBeGreaterThan(50 * 1024);

  await hostApp.getByRole('link', { name: 'Play online' }).first().click();
  await expect(hostApp).toHaveURL(/#\/online/);
});

test('a guest told the wrong code is told why', async () => {
  const guestApp = await page(guest, 'app.html');
  await guestApp.getByRole('button', { name: 'Leave' }).click();
  await expect(status(guestApp)).toHaveAttribute('data-phase', 'idle');

  await guestApp.getByRole('button', { name: 'Join a game' }).click();
  await guestApp.getByRole('textbox', { name: 'Lobby code' }).fill('ZZZ-ZZZ');
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guestApp.getByRole('alert')).toHaveText(
    /lobby code is not open/,
    { timeout: 15_000 }
  );
});

test('the debug log says what the relay did, without the key', async () => {
  const guestApp = await page(guest, 'app.html');
  await guestApp.getByRole('button', { name: 'Show debug log' }).click();

  await expect(guestApp.getByTestId('debug-env')).toContainText(
    `relay 127.0.0.1:${new URL(baseUrl).port} (key set)`
  );
  const entries = guestApp.getByTestId('debug-entries');
  await expect(entries).toContainText('dialling the relay');
  // The attempt that was just refused, as the player would screenshot it.
  await expect(entries).toContainText('the relay refused us');
  await expect(entries).not.toContainText(APP_KEY);

  await guestApp.getByRole('button', { name: 'Hide debug log' }).click();
});

test('the pod ends for everyone when the host leaves', async () => {
  const hostApp = await page(host, 'app.html');
  const guestApp = await page(guest, 'app.html');

  // Back in, so there is a pod to end.
  const code = (await hostApp.getByTestId('lobby-code').textContent()) ?? '';
  await guestApp.getByRole('textbox', { name: 'Lobby code' }).fill(code);
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(status(guestApp)).toHaveAttribute('data-phase', 'connected', {
    timeout: 20_000,
  });

  await hostApp.getByRole('button', { name: 'Leave' }).click();
  await expect(status(hostApp)).toHaveAttribute('data-phase', 'idle');
  await expect(status(guestApp)).toHaveText(/host \(Alice\) left the game/, {
    timeout: 15_000,
  });
});

test('no renderer console errors in either instance', () => {
  expect({ host: host.errors, guest: guest.errors }).toEqual({
    host: [],
    guest: [],
  });
});
