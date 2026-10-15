import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DebugSnapshot } from '@shared/debug';
import type { GameState } from '@shared/game';
import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';

// A pod of four app instances linked over loopback, the host plus three
// guests. Dave stands in for an older build: he never announces that he
// can be shown cards.

interface TestHooks {
  openSampleCommanderPlayTest(seed?: number): Promise<void>;
  gameState(): GameState;
  profile(): { playerId: string; displayName: string };
}

interface Player {
  name: string;
  seat: number;
  app: ElectronApplication;
  userDataDir: string;
  errors: string[];
}

const DREADMAW = 'Colossal Dreadmaw';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let players: Player[] = [];
const [ALICE, BOB, CAROL, DAVE] = [0, 1, 2, 3];

const launch = async (
  name: string,
  seat: number,
  extraEnv: Record<string, string> = {}
): Promise<Player> => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), `mtg-reveal-${name}-`));
  // Each player's hand gets its own window, so no board ever hosts it.
  writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ handInBoard: false })
  );
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1', ...extraEnv },
  });
  const errors: string[] = [];
  const watch = (page: Page) => {
    const where = () => `${name}/${page.url().split('/').pop()}`;
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`${where()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`${where()}: ${err.message}`));
  };
  app.windows().forEach(watch);
  app.on('window', watch);
  return { name, seat, app, userDataDir, errors };
};

const page = async ({ app }: Player, html: string): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes(html)), {
      timeout: 20_000,
    })
    .toBe(true);
  const found = app.windows().find((w) => w.url().includes(html));
  if (!found) throw new Error(`no ${html} window`);
  await found.waitForLoadState('load');
  return found;
};

const lobby = async (player: Player) => {
  const app = await page(player, 'app.html');
  await app.getByRole('link', { name: 'Settings' }).first().click();
  await expect(app).toHaveURL(/#\/settings/);
  await app.getByLabel('Your name').fill(player.name);
  await app.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    app.getByRole('button', { name: 'Save', exact: true })
  ).toBeDisabled();
  await app.getByRole('link', { name: 'Play online' }).first().click();
  await expect(app).toHaveURL(/#\/online/);
  await app.getByRole('tab', { name: 'Invite codes' }).click();
  return app;
};

const codeValue = async (box: Locator) => {
  await expect(box).toHaveValue(/^MPM1:[A-Za-z0-9_-]+$/, { timeout: 20_000 });
  return box.inputValue();
};

const opponentSide = (board: Page, name: string) =>
  board.locator(`[data-testid="opponent-side"][data-player-name="${name}"]`);

// Lines this instance's main process logged; "in reveal" is one it was
// sent, whoever it was meant for.
const debugLines = async (player: Player) => {
  const app = await page(player, 'app.html');
  const snapshot = await app.evaluate(() =>
    (
      window as unknown as { api: { getDebugLog(): Promise<DebugSnapshot> } }
    ).api.getDebugLog()
  );
  return snapshot.entries.map((entry) => entry.text);
};

const handNames = async (hand: Page) =>
  (await hand
    .getByTestId('hand')
    .getByTestId('card')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-card-name'))
    )) as string[];

const occurrences = (html: string, name: string) => html.split(name).length - 1;

// The host's hand window, then every board, as HTML.
const snapshots = async () => [
  await (await page(players[ALICE], 'hand.html')).content(),
  ...(await Promise.all(
    (await Promise.all(players.map((p) => page(p, 'board.html')))).map((b) =>
      b.content()
    )
  )),
];

const boards = () => Promise.all(players.map((p) => page(p, 'board.html')));

const boardHtml = async () =>
  Promise.all((await boards()).map((board) => board.content()));

test.beforeAll(async () => {
  players = await Promise.all([
    launch('Alice', 1),
    launch('Bob', 2),
    launch('Carol', 3),
    launch('Dave', 4, { MTG_PLAY_MAT_TEST_DROP_FEATURES: 'reveal' }),
  ]);
});

test.afterAll(async () => {
  for (const player of players) {
    await player.app.close().catch(() => {});
    rmSync(player.userDataDir, { recursive: true, force: true });
  }
});

test('four players sit down to a commander game', async () => {
  const apps = await Promise.all(players.map(lobby));
  const host = apps[ALICE];
  await host.getByRole('button', { name: 'Host a game' }).click();
  await host.getByRole('button', { name: 'Invite seat 3' }).click();
  await host.getByRole('button', { name: 'Invite seat 4' }).click();
  for (const guest of [BOB, CAROL, DAVE]) {
    const { seat } = players[guest];
    const invite = await codeValue(
      host.getByLabel(`Invite code for seat ${seat}`)
    );
    const app = apps[guest];
    await app.getByRole('button', { name: 'Join a game' }).click();
    await app.getByLabel('Invite to join').fill(invite);
    await app.getByRole('button', { name: 'Join', exact: true }).click();
    const reply = await codeValue(app.getByLabel('Your reply code'));
    const seatBox = host.getByTestId(`seat-${seat}`);
    await seatBox.getByLabel(`Reply code for seat ${seat}`).fill(reply);
    await seatBox.getByRole('button', { name: 'Connect' }).click();
    await expect(seatBox).toHaveAttribute('data-phase', 'connected', {
      timeout: 20_000,
    });
  }

  await Promise.all(
    players.map((player, i) =>
      player.app.evaluate(
        (_electron, seed) =>
          (
            globalThis as unknown as { testHooks: TestHooks }
          ).testHooks.openSampleCommanderPlayTest(seed),
        2000 + i
      )
    )
  );
  const all = await boards();
  for (const board of all) {
    await expect(board.getByTestId('opponent-side')).toHaveCount(3);
  }
  for (const player of players) {
    const hand = await page(player, 'hand.html');
    await hand.getByRole('button', { name: 'Keep' }).click();
  }
});

test('Alice shows Bob a card: only Bob’s hand window ever names it', async () => {
  const hand = await page(players[ALICE], 'hand.html');
  const names = await handNames(hand);
  // A card nobody can see on any board, so its name showing up anywhere
  // public would be a leak.
  const secret = names.find((name) => name !== DREADMAW);
  if (!secret) throw new Error('no card to reveal');
  const index = names.indexOf(secret);

  await hand
    .getByTestId('hand')
    .getByTestId('card')
    .nth(index)
    .click({ button: 'right' });
  await expect(
    hand.getByRole('menuitem', { name: 'Reveal to everyone' })
  ).toBeEnabled();
  await expect(
    hand.getByRole('menuitem', {
      name: 'Reveal to Dave (needs a newer version)',
    })
  ).toBeDisabled();
  await expect(
    hand.getByRole('menuitem', { name: 'Reveal to Carol' })
  ).toBeEnabled();
  await hand.getByRole('menuitem', { name: 'Reveal to Bob' }).click();

  // Bob's hand window shows it, until he dismisses it.
  const bobHand = await page(players[BOB], 'hand.html');
  const tray = bobHand.getByTestId('shown-to-you');
  await expect(
    tray.locator(`[data-testid="card"][data-card-name="${secret}"]`)
  ).toHaveCount(1);
  await expect(tray.getByTestId('shown-to-you-entry')).toHaveAttribute(
    'data-from',
    'Alice'
  );
  await bobHand.getByRole('button', { name: 'Private log' }).click();
  await expect(bobHand.getByTestId('private-log')).toContainText(
    `Alice showed you a card from their hand: ${secret}`
  );
  await bobHand.keyboard.press('Escape');
  await expect(
    (await page(players[ALICE], 'hand.html')).getByTestId('hand-showing-banner')
  ).toContainText('Only Bob can see the card you showed');

  // Everyone else sees who and how many, never which.
  const [aliceBoard, bobBoard, carolBoard, daveBoard] = await boards();
  await expect(
    opponentSide(carolBoard, 'Alice').getByTestId('opponent-showing-badge')
  ).toHaveText('Alice is showing Bob 1 card');
  await expect(
    opponentSide(bobBoard, 'Alice').getByTestId('opponent-showing-badge')
  ).toHaveText('Alice is showing you 1 card');
  await expect(aliceBoard.getByTestId('showing-badge')).toHaveText(
    'Alice is showing Bob 1 card'
  );
  for (const board of [aliceBoard, bobBoard, carolBoard, daveBoard]) {
    await expect(
      board
        .getByTestId('log-entry')
        .filter({ hasText: 'revealed a card from their hand to Bob' })
    ).toHaveCount(1);
  }
  for (const html of await boardHtml()) expect(html).not.toContain(secret);

  // Sent to Bob alone: no other guest was ever handed a reveal.
  await expect
    .poll(async () => (await debugLines(players[BOB])).join('\n'))
    .toContain('reveal show arrived');
  for (const other of [CAROL, DAVE]) {
    const lines = await debugLines(players[other]);
    expect(lines.filter((line) => line.includes('reveal'))).toEqual([]);
  }
});

test('a guest’s reveal goes through the host to that seat alone', async () => {
  const before = await snapshots();
  const hand = await page(players[CAROL], 'hand.html');
  await hand.getByRole('button', { name: 'Reveal hand' }).click();
  await hand.getByRole('menuitem', { name: 'Reveal hand to Bob' }).click();
  const carolCards = await handNames(hand);

  const bobHand = await page(players[BOB], 'hand.html');
  const entries = bobHand.getByTestId('shown-to-you-entry');
  await expect(entries).toHaveCount(2);
  const fromCarol = entries.and(bobHand.locator('[data-from="Carol"]'));
  await expect(fromCarol.getByTestId('card')).toHaveCount(carolCards.length);

  const [, , , daveBoard] = await boards();
  await expect(
    opponentSide(daveBoard, 'Carol').getByTestId('opponent-showing-badge')
  ).toHaveText('Carol is showing Bob 7 cards');
  const daveLines = await debugLines(players[DAVE]);
  expect(daveLines.filter((line) => line.includes('reveal'))).toEqual([]);

  // The host passed it on, but neither its hand window nor any board
  // names Carol's cards: no name shows up more often than before.
  const after = await snapshots();
  for (const name of new Set(carolCards)) {
    after.forEach((html, i) =>
      expect(occurrences(html, name)).toBe(occurrences(before[i], name))
    );
  }
});

test('search picks can be shown to one player, which ends the last showing', async () => {
  const hand = await page(players[ALICE], 'hand.html');
  await hand.getByRole('button', { name: 'Search library…' }).click();
  const tile = hand.getByTestId('search-card').first().getByTestId('card');
  const picked = await tile.getAttribute('data-card-name');
  if (!picked) throw new Error('no card to pick');
  await tile.click();
  await hand.getByLabel('Reveal picked cards').check();
  await hand
    .getByLabel('Reveal picked cards to')
    .selectOption({ label: 'Carol' });
  await hand.getByRole('button', { name: 'Move 1 and shuffle' }).click();

  const carolHand = await page(players[CAROL], 'hand.html');
  await expect(
    carolHand
      .getByTestId('shown-to-you')
      .locator(`[data-testid="card"][data-card-name="${picked}"]`)
  ).toHaveCount(1);

  // Bob still has what Alice showed him, marked as no longer shown.
  const bobHand = await page(players[BOB], 'hand.html');
  const fromAlice = bobHand
    .getByTestId('shown-to-you-entry')
    .and(bobHand.locator('[data-from="Alice"]'));
  await expect(fromAlice).toHaveAttribute('data-ended', 'true');
  await fromAlice
    .getByRole('button', { name: 'Dismiss the cards Alice showed you' })
    .click();
  await expect(fromAlice).toHaveCount(0);

  const [, bobBoard] = await boards();
  await expect(
    opponentSide(bobBoard, 'Alice').getByTestId('opponent-showing-badge')
  ).toHaveText('Alice is showing Carol 1 card');
  await expect(
    bobBoard
      .getByTestId('log-entry')
      .filter({ hasText: 'revealed a card they searched for to Carol' })
  ).toHaveCount(1);
  // Dismissed from the tray, but still listed as seen in Bob's hand
  // window; his board's Revealed tab only lists reveals to everyone.
  await bobHand.getByRole('button', { name: 'Private log' }).click();
  await bobHand.getByRole('tab', { name: /^Shown to you/ }).click();
  const seen = bobHand.getByTestId('seen-by-you').getByTestId('seen-entry');
  await expect(seen.and(bobHand.locator('[data-by="Alice"]'))).toContainText(
    'Alice showed you a card from their hand'
  );
  await expect(seen.and(bobHand.locator('[data-by="Carol"]'))).toContainText(
    'Carol showed you their hand (7 cards)'
  );
  await bobHand.keyboard.press('Escape');
  const bobTable = bobBoard.getByTestId('table-panel');
  await bobTable.getByRole('tab', { name: 'Revealed' }).click();
  await expect(bobTable.getByTestId('seen-list')).not.toContainText(
    'showed you'
  );
  await bobTable.getByRole('tab', { name: 'Log' }).click();
});

test('no renderer console errors', () => {
  for (const player of players) expect(player.errors).toEqual([]);
});
