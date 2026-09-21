import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { GameState, PublicZoneId } from '@shared/game';
import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';

// Two app instances with their own profiles, connected to each other over
// loopback. No STUN server is involved: test hooks default to host
// candidates only.

interface TestHooks {
  openSamplePlayTest(seed?: number): Promise<void>;
  openSampleCommanderPlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
  profile(): { playerId: string; displayName: string };
}

interface Instance {
  app: ElectronApplication;
  userDataDir: string;
  errors: string[];
}

const env = { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1' };

const electronBinary = createRequire(path.join(process.cwd(), 'package.json'))(
  'electron'
) as string;

test.describe.configure({ mode: 'serial' });

let host: Instance;
let guest: Instance;

const launch = async (label: string): Promise<Instance> => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), `mtg-net-${label}-`));
  // The turn number reaching the other board needs turn tracking on,
  // and these steps drive the separate hand window.
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ turnTracking: true, handInBoard: false })
  );
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env,
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

// Runs in the main process, so it can only use what it is passed.
const openPlayTest = ({ app }: Instance, seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.openSamplePlayTest(s),
    seed
  );

const openCommanderPlayTest = ({ app }: Instance, seed: number) =>
  app.evaluate(
    (_electron, s) =>
      (
        globalThis as unknown as { testHooks: TestHooks }
      ).testHooks.openSampleCommanderPlayTest(s),
    seed
  );

const gameState = ({ app }: Instance) =>
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.gameState()
  );

const profileOf = ({ app }: Instance) =>
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.profile()
  );

const lobby = async (instance: Instance, name: string) => {
  const app = await page(instance, 'app.html');
  await app.getByRole('link', { name: 'Settings' }).first().click();
  await expect(app).toHaveURL(/#\/settings/);
  await app.getByLabel('Your name').fill(name);
  await app.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('button', { name: 'Save' })).toBeDisabled();
  await app.getByRole('link', { name: 'Play online' }).first().click();
  await expect(app).toHaveURL(/#\/online/);
  await expect(app.getByTestId('online-name')).toContainText(name);
  return app;
};

const status = (app: Page) => app.getByTestId('net-status');

const codeValue = async (box: Locator) => {
  await expect(box).toHaveValue(/^MPM1:[A-Za-z0-9_-]+$/, { timeout: 15_000 });
  return box.inputValue();
};

const connect = async (hostApp: Page, guestApp: Page, invite: string) => {
  const reply = await codeValue(guestApp.getByLabel('Your reply code'));
  await hostApp.getByLabel('Reply code for seat 2').fill(reply);
  await hostApp.getByRole('button', { name: 'Connect' }).click();
  await expect(status(hostApp)).toHaveAttribute('data-phase', 'connected', {
    timeout: 20_000,
  });
  await expect(status(guestApp)).toHaveAttribute('data-phase', 'connected');
  await expect(status(hostApp)).toHaveText(/Connected to Bob/);
  await expect(status(guestApp)).toHaveText(/Connected to Alice/);
  expect(invite).not.toEqual(reply);
};

const handCards = (hand: Page) => hand.getByTestId('hand').getByTestId('card');
const ownField = (board: Page) =>
  board.getByTestId('battlefield').getByTestId('card');
const opponentField = (board: Page) =>
  board.getByTestId('opponent-battlefield').getByTestId('card');

test.beforeAll(async () => {
  [host, guest] = await Promise.all([launch('host'), launch('guest')]);
});

test.afterAll(async () => {
  for (const instance of [host, guest]) {
    await instance?.app.close().catch(() => {});
    if (instance)
      rmSync(instance.userDataDir, { recursive: true, force: true });
  }
});

test('host and guest connect by swapping codes', async () => {
  const hostApp = await lobby(host, 'Alice');
  const guestApp = await lobby(guest, 'Bob');

  await hostApp.getByRole('button', { name: 'Host a game' }).click();
  const invite = await codeValue(hostApp.getByLabel('Invite code for seat 2'));

  // A reply pasted where the invite belongs is explained, not attempted.
  await guestApp.getByRole('button', { name: 'Join a game' }).click();
  await guestApp.getByLabel('Invite to join').fill('MPM1:nonsense!');
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guestApp.getByRole('alert')).toHaveText(/MTG Play Mat code/);

  await guestApp.getByLabel('Invite to join').fill(invite);
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();
  await connect(hostApp, guestApp, invite);
});

test('each board shows the other side live, read-only', async () => {
  await Promise.all([openPlayTest(host, 1111), openPlayTest(guest, 2222)]);
  const [hostBoard, hostHand, guestBoard, guestHand] = await Promise.all([
    page(host, 'board.html'),
    page(host, 'hand.html'),
    page(guest, 'board.html'),
    page(guest, 'hand.html'),
  ]);

  await expect(guestBoard.getByTestId('opponent-name')).toHaveText('Alice');
  await expect(hostBoard.getByTestId('opponent-name')).toHaveText('Bob');
  await expect(guestBoard.getByTestId('opponent-library')).toHaveAttribute(
    'data-count',
    '53'
  );
  await expect(guestBoard.getByTestId('opponent-mulligan-status')).toHaveText(
    /Mulligans 0/
  );

  // Host keeps and plays a card: the guest sees it, with hand counts.
  await hostHand.getByRole('button', { name: 'Keep' }).click();
  await expect(guestBoard.getByTestId('opponent-mulligan-status')).toHaveCount(
    0
  );
  const played = handCards(hostHand).first();
  const name = await played.getAttribute('data-card-name');
  await played.click();
  await expect(ownField(hostBoard)).toHaveCount(1);
  await expect(opponentField(guestBoard)).toHaveCount(1);
  await expect(opponentField(guestBoard)).toHaveAttribute(
    'data-card-name',
    name ?? ''
  );
  await expect(guestBoard.getByTestId('opponent-hand-count')).toHaveAttribute(
    'data-count',
    '6'
  );

  // Remote instance ids are namespaced, never shared with local ones.
  const hostId = await ownField(hostBoard).getAttribute('data-instance-id');
  const seenId =
    await opponentField(guestBoard).getAttribute('data-instance-id');
  expect(seenId).not.toEqual(hostId);
  expect(seenId?.endsWith(`/${hostId}`)).toBe(true);

  // Tapping shows up on the other side too.
  await ownField(hostBoard).click();
  await expect(opponentField(guestBoard)).toHaveClass(/rotate-90/);

  // And the reverse: the guest plays, the host sees it.
  await guestHand.getByRole('button', { name: 'Keep' }).click();
  await handCards(guestHand).first().click();
  await expect(ownField(guestBoard)).toHaveCount(1);
  await expect(opponentField(hostBoard)).toHaveCount(1);
  await expect(hostBoard.getByTestId('opponent-hand-count')).toHaveAttribute(
    'data-count',
    '6'
  );

  // Life and piles.
  await hostBoard.getByRole('button', { name: 'Lose 1 life' }).click();
  await expect(guestBoard.getByTestId('opponent-life')).toHaveText('19');
  await ownField(hostBoard).click({ button: 'right' });
  await hostBoard
    .getByRole('menuitem', { name: 'Move to graveyard', exact: true })
    .click();
  await expect(guestBoard.getByTestId('opponent-graveyard')).toHaveAttribute(
    'data-count',
    '1'
  );
  await expect(opponentField(guestBoard)).toHaveCount(0);

  // The opponent's graveyard is browsable but offers no actions.
  await guestBoard
    .getByRole('button', { name: "Browse opponent's graveyard" })
    .click();
  const browser = guestBoard.getByRole('dialog', {
    name: "Alice's graveyard (1)",
  });
  await expect(browser.getByTestId('card')).toHaveAttribute(
    'data-card-name',
    name ?? ''
  );
  await browser.getByTestId('card').click({ button: 'right' });
  await expect(guestBoard.getByRole('menuitem')).toHaveCount(0);
  await guestBoard.keyboard.press('Escape');
  await expect(browser).toHaveCount(0);

  // Opponent cards are not drop targets and get the hover preview.
  await expect(
    guestBoard.locator('[data-testid^="opponent-"][data-drop-zone]')
  ).toHaveCount(0);
  await handCards(hostHand).first().click();
  await expect(opponentField(guestBoard)).toHaveCount(1);
  await opponentField(guestBoard).hover();
  await expect(guestBoard.getByTestId('card-preview')).toBeVisible();
  await guestBoard.mouse.move(2, 2);
});

test('each player’s actions show in the log on both boards', async () => {
  const [hostBoard, hostHand, guestBoard] = await Promise.all([
    page(host, 'board.html'),
    page(host, 'hand.html'),
    page(guest, 'board.html'),
  ]);
  const entries = (board: Page, by: string) =>
    board
      .getByTestId('table-log')
      .locator(`[data-testid="log-entry"][data-by="${by}"]`);
  const texts = (board: Page, by: string) =>
    entries(board, by).allTextContents();

  // What already happened: each board has both players' lines.
  for (const board of [hostBoard, guestBoard]) {
    await expect(entries(board, 'Alice').last()).toBeVisible();
    await expect(entries(board, 'Bob').last()).toBeVisible();
    await expect
      .poll(() => texts(board, 'Alice'))
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining('Alice kept their hand of 7'),
          expect.stringMatching(/Alice played \S/),
          expect.stringContaining('Alice lost 1 life (20 → 19)'),
        ])
      );
    await expect
      .poll(() => texts(board, 'Bob'))
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining('Bob kept their hand of 7'),
          expect.stringMatching(/Bob played \S/),
        ])
      );
  }

  // New actions reach the other board, undo included.
  await hostBoard.getByRole('button', { name: 'Draw a card' }).click();
  for (const board of [hostBoard, guestBoard]) {
    await expect(entries(board, 'Alice').last()).toHaveText(
      /Alice drew a card$/
    );
  }
  await hostHand.getByRole('button', { name: 'Undo' }).click();
  for (const board of [hostBoard, guestBoard]) {
    await expect(entries(board, 'Alice').last()).toHaveText(
      /Alice undid: drew a card$/
    );
  }
  await guestBoard.getByRole('button', { name: 'Draw a card' }).click();
  for (const board of [hostBoard, guestBoard]) {
    await expect(entries(board, 'Bob').last()).toHaveText(/Bob drew a card$/);
  }

  // Newest at the bottom, and the Dice tab hides actions.
  await hostBoard.getByRole('tab', { name: 'Dice' }).click();
  await expect(hostBoard.getByTestId('log-entry')).toHaveCount(0);
  await hostBoard.getByRole('tab', { name: 'Log' }).click();
  await expect(
    hostBoard.getByTestId('table-log-list').locator('li').last()
  ).toHaveText(/Bob drew a card$/);
});

test('the wire never carries the sender’s hidden cards', async () => {
  const net = await page(host, 'net.html');
  const wire = await net.evaluate(
    () => (window as unknown as { netWire: string[] }).netWire
  );
  const state = await gameState(host);
  const { playerId } = await profileOf(host);
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error('no local player');

  const hidden = [...me.zones.hand, ...me.zones.library];
  expect(hidden.length).toBeGreaterThan(50);
  expect(wire.length).toBeGreaterThan(5);

  const deckNames = new Set(Object.values(state.cards).map((c) => c.ref.name));
  const deckIds = new Set(Object.values(state.cards).map((c) => c.ref.id));
  const publicZones: PublicZoneId[] = [
    'battlefield',
    'graveyard',
    'exile',
    'command',
  ];
  const shownNames = new Set(
    publicZones.flatMap((zone) =>
      me.zones[zone].map((id) => state.cards[id].ref.name)
    )
  );
  const hiddenOnly = [...deckNames].filter((name) => !shownNames.has(name));
  expect(hiddenOnly.length).toBeGreaterThan(0);
  let logLines = 0;

  for (const raw of wire) {
    // Nothing ever names a card that is in the hand or library now; none
    // of them has been public during this test.
    for (const id of hidden) expect(raw).not.toContain(JSON.stringify(id));

    const message = JSON.parse(raw) as {
      from: string;
      kind: string;
      view?: {
        zones: Record<string, { zone: string }[]>;
        handCount: number;
        libraryCount: number;
      } | null;
    };
    expect(message.from).toBe(playerId);
    if (message.kind === 'log') {
      // Log lines may name only cards that have been public.
      for (const name of hiddenOnly) expect(raw).not.toContain(name);
      logLines += 1;
      continue;
    }
    if (message.kind !== 'public' || !message.view) {
      for (const name of deckNames) expect(raw).not.toContain(name);
      continue;
    }

    // Card identities appear only as cards in public zones, and every card
    // of the 60 is accounted for by those zones plus the two counts.
    const { zones, handCount, libraryCount } = message.view;
    expect(Object.keys(zones).sort()).toEqual([...publicZones].sort());
    let shown = 0;
    for (const zone of publicZones) {
      zones[zone].forEach((card) => expect(card.zone).toBe(zone));
      shown += zones[zone].length;
    }
    expect(shown + handCount + libraryCount).toBe(60);

    const rest = JSON.stringify({ ...message.view, zones: null });
    for (const text of [...deckNames, ...deckIds]) {
      expect(rest).not.toContain(text);
    }
  }
  expect(logLines).toBeGreaterThan(3);
});

test('leaving clears the opponent side on both boards', async () => {
  const [hostApp, guestApp, hostBoard, guestBoard] = await Promise.all([
    page(host, 'app.html'),
    page(guest, 'app.html'),
    page(host, 'board.html'),
    page(guest, 'board.html'),
  ]);
  await expect(guestBoard.getByTestId('opponent-side')).toHaveCount(1);

  await hostApp.getByRole('button', { name: 'Leave' }).click();
  await expect(hostBoard.getByTestId('opponent-side')).toHaveCount(0);
  await expect(guestBoard.getByTestId('opponent-side')).toHaveCount(0);
  await expect(status(hostApp)).toHaveAttribute('data-phase', 'idle');
  await expect(status(guestApp)).toHaveText(/The host \(Alice\) left the game/);

  // The local game is untouched.
  await expect(ownField(hostBoard)).toHaveCount(1);
});

test('an invite link reaches the running app and reconnects', async () => {
  const [hostApp, guestApp, guestBoard] = await Promise.all([
    page(host, 'app.html'),
    page(guest, 'app.html'),
    page(guest, 'board.html'),
  ]);
  await guestApp.getByRole('link', { name: 'Deck Builder' }).first().click();

  await hostApp.getByRole('button', { name: 'Host a game' }).click();
  const invite = await codeValue(hostApp.getByLabel('Invite code for seat 2'));

  // A second launch with the link hands it to the running guest and exits.
  const second = spawn(
    electronBinary,
    [
      '.',
      `--user-data-dir=${guest.userDataDir}`,
      `mtgplaymat://join?c=${invite}`,
    ],
    { env, stdio: 'ignore' }
  );
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill();
      reject(new Error('second instance did not exit'));
    }, 20_000);
    second.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  expect(exitCode).toBe(0);

  await expect(guestApp).toHaveURL(/#\/online/);
  await expect(guestApp.getByLabel('Invite to join')).toHaveValue(invite);
  await guestApp.getByRole('button', { name: 'Join', exact: true }).click();
  await connect(hostApp, guestApp, invite);

  // Reconnected: the host's table is back on the guest's board.
  await expect(opponentField(guestBoard)).toHaveCount(1);
  await expect(guestBoard.getByTestId('opponent-graveyard')).toHaveAttribute(
    'data-count',
    '1'
  );
});

test('commanders, tax, and commander damage reach the other board', async () => {
  const DREADMAW = 'Colossal Dreadmaw';
  await openCommanderPlayTest(host, 3333);
  const [hostBoard, guestBoard] = await Promise.all([
    page(host, 'board.html'),
    page(guest, 'board.html'),
  ]);
  const seen = guestBoard
    .getByTestId('opponent-command')
    .locator(`[data-testid="commander"][data-card-name="${DREADMAW}"]`);

  await expect(guestBoard.getByTestId('opponent-life')).toHaveText('40');
  await expect(seen).toHaveAttribute('data-zone', 'command');
  await expect(seen.getByTestId('commander-tax')).toHaveText('Tax +0');
  await expect(seen.getByTestId('commander-badge')).toBeVisible();

  // Read-only: clicking the opponent's commander casts nothing.
  await seen.getByTestId('card').click();
  await seen.getByTestId('card').click({ button: 'right' });
  await expect(guestBoard.getByRole('menuitem')).toHaveCount(0);
  await expect(seen).toHaveAttribute('data-zone', 'command');

  await hostBoard.getByTestId('command-zone').getByTestId('card').click();
  await expect(seen).toHaveAttribute('data-zone', 'battlefield');
  await expect(seen.getByTestId('commander-tax')).toHaveText('Tax +2');
  await expect(
    opponentField(guestBoard).getByTestId('commander-badge')
  ).toHaveCount(1);

  // The guest records the damage it took; the host sees it and the life.
  const taken = guestBoard
    .getByTestId('commander-damage-taken')
    .getByTestId('commander-damage');
  await expect(taken).toHaveAttribute('data-source-name', DREADMAW);
  const more = guestBoard.getByRole('button', {
    name: `More commander damage from ${DREADMAW}`,
  });
  for (let i = 0; i < 3; i += 1) await more.click();
  await expect(taken).toHaveAttribute('data-damage', '3');
  await expect(guestBoard.getByTestId('life')).toHaveText('17');

  const recorded = hostBoard
    .getByTestId('opponent-commander-damage')
    .getByTestId('commander-damage');
  await expect(recorded).toHaveAttribute('data-damage', '3');
  await expect(recorded).toHaveAttribute('data-source-name', DREADMAW);
  await expect(hostBoard.getByTestId('opponent-life')).toHaveText('17');
  await expect(recorded.getByRole('button')).toHaveCount(0);

  for (let i = 0; i < 18; i += 1) await more.click();
  await expect(taken).toHaveAttribute('data-lethal', 'true');
  await expect(recorded).toHaveAttribute('data-damage', '21');
  await expect(recorded).toHaveAttribute('data-lethal', 'true');
});

test('a reveal and the turn number reach the other board', async () => {
  const [hostBoard, hostHand, guestBoard] = await Promise.all([
    page(host, 'board.html'),
    page(host, 'hand.html'),
    page(guest, 'board.html'),
  ]);
  const panel = guestBoard.getByTestId('opponent-reveal-panel');
  const turn = guestBoard.getByTestId('opponent-turn');
  await expect(panel).toHaveCount(0);

  const card = handCards(hostHand).first();
  const name = await card.getAttribute('data-card-name');
  await card.click({ button: 'right' });
  await hostHand.getByRole('menuitem', { name: 'Reveal', exact: true }).click();
  await expect(panel.getByTestId('card')).toHaveAttribute(
    'data-card-name',
    name!
  );
  // Only its owner can put it away.
  await expect(panel.getByRole('button', { name: 'Hide' })).toHaveCount(0);

  const before = Number(await hostBoard.getByTestId('turn').textContent());
  await expect(turn).toContainText(`Turn ${before}`);
  await hostBoard.getByRole('button', { name: 'Next turn' }).click();
  await expect(turn).toContainText(`Turn ${before + 1}`);
  await expect(panel).toHaveCount(0);
});

test('library activity shows on both boards and always clears', async () => {
  const [hostBoard, hostHand, guestBoard] = await Promise.all([
    page(host, 'board.html'),
    page(host, 'hand.html'),
    page(guest, 'board.html'),
  ]);
  const own = hostBoard.getByTestId('library-activity');
  const theirs = guestBoard.getByTestId('opponent-library-activity');
  const aliceLines = (board: Page) =>
    board
      .getByTestId('table-log')
      .locator('[data-testid="log-entry"][data-by="Alice"]');
  const cleared = async () => {
    await expect(own).toHaveCount(0);
    await expect(theirs).toHaveCount(0);
  };
  const search = async () => {
    await hostHand.getByRole('button', { name: 'Search library…' }).click();
    await expect(own).toHaveAttribute('data-kind', 'search');
    await expect(theirs).toHaveAttribute('title', 'Searching library…');
  };
  const lookAtTop = async (count: number) => {
    await hostHand.getByRole('button', { name: 'Look at top…' }).click();
    await hostHand.getByLabel('How many cards?').fill(String(count));
    await hostHand.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(own).toHaveAttribute('title', `Looking at top ${count}…`);
    await expect(theirs).toHaveText(`Top ${count}…`);
  };
  await cleared();

  // Searching, finished by confirming: one line on start, then the
  // search's own line.
  await search();
  for (const board of [hostBoard, guestBoard]) {
    await expect(aliceLines(board).last()).toHaveText(
      /Alice is searching their library$/
    );
  }
  await hostHand.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await cleared();
  for (const board of [hostBoard, guestBoard]) {
    await expect(aliceLines(board).last()).not.toHaveText(/is searching/);
  }

  // Looking, finished by cancelling. Reopening it adds no second line.
  await lookAtTop(3);
  for (const board of [hostBoard, guestBoard]) {
    await expect(aliceLines(board).last()).toHaveText(
      /Alice is looking at the top 3 cards of their library$/
    );
  }
  await hostHand.getByRole('button', { name: 'Cancel' }).click();
  await cleared();
  const lines = await aliceLines(guestBoard).count();
  await lookAtTop(3);
  await hostHand.getByRole('button', { name: 'Cancel' }).click();
  await cleared();
  expect(await aliceLines(guestBoard).count()).toBe(lines);

  // A restart closes the dialog.
  await search();
  await hostBoard.evaluate(() => window.api.restartPlayTest());
  await expect(hostHand.getByTestId('library-search')).toHaveCount(0);
  await cleared();
  await expect(aliceLines(guestBoard).last()).toHaveText(
    /Alice restarted the game$/
  );

  // Closing the hand window ends the game, and the activity with it.
  await search();
  await hostHand.evaluate(() => window.close()).catch(() => {});
  await expect(guestBoard.getByTestId('opponent-side')).toContainText(
    'Alice has no game open'
  );
  await expect(theirs).toHaveCount(0);
  await openPlayTest(host, 7);
  const board = await page(host, 'board.html');
  await expect(board.getByTestId('library')).toBeVisible();
  await expect(board.getByTestId('library-activity')).toHaveCount(0);
  await expect(guestBoard.getByTestId('opponent-library')).toBeVisible();
  await expect(theirs).toHaveCount(0);
});

test('no renderer console errors in either instance', () => {
  expect([...host.errors, ...guest.errors]).toEqual([]);
});
