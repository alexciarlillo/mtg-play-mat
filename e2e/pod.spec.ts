import { mkdtempSync, rmSync } from 'node:fs';
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

// A four-player pod: four app instances with their own profiles, every
// guest linked to the host over loopback. No STUN server is involved.

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

interface WireMessage {
  from: string;
  kind: string;
  seq: number;
  view?: {
    zones: Record<string, { zone: string }[]>;
    handCount: number;
    libraryCount: number;
  } | null;
}

const env = { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1' };
const DREADMAW = 'Colossal Dreadmaw';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

let players: Player[] = [];
const [ALICE, BOB, CAROL, DAVE] = [0, 1, 2, 3];

const launch = async (name: string, seat: number): Promise<Player> => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), `mtg-pod-${name}-`));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env,
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

// Runs in the main process, so it can only use what it is passed.
const gameState = ({ app }: Player) =>
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.gameState()
  );

const profileOf = ({ app }: Player) =>
  app.evaluate(() =>
    (globalThis as unknown as { testHooks: TestHooks }).testHooks.profile()
  );

const lobby = async (player: Player) => {
  const app = await page(player, 'app.html');
  await app.getByRole('link', { name: 'Settings' }).first().click();
  await expect(app).toHaveURL(/#\/settings/);
  await app.getByLabel('Your name').fill(player.name);
  await app.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('button', { name: 'Save' })).toBeDisabled();
  await app.getByRole('link', { name: 'Play online' }).first().click();
  await expect(app).toHaveURL(/#\/online/);
  await expect(app.getByTestId('online-name')).toContainText(player.name);
  return app;
};

const status = (app: Page) => app.getByTestId('net-status');

const codeValue = async (box: Locator) => {
  await expect(box).toHaveValue(/^MPM1:[A-Za-z0-9_-]+$/, { timeout: 20_000 });
  return box.inputValue();
};

const wireOf = async (player: Player) => {
  const net = await page(player, 'net.html');
  return net.evaluate(
    () => (window as unknown as { netWire: string[] }).netWire
  );
};

const opponentSide = (board: Page, name: string) =>
  board.locator(`[data-testid="opponent-side"][data-player-name="${name}"]`);

const others = (player: Player) => players.filter((p) => p !== player);

test.beforeAll(async () => {
  players = await Promise.all(
    ['Alice', 'Bob', 'Carol', 'Dave'].map((name, i) => launch(name, i + 1))
  );
});

test.afterAll(async () => {
  for (const player of players) {
    await player.app.close().catch(() => {});
    rmSync(player.userDataDir, { recursive: true, force: true });
  }
});

test('the host seats three guests, each with its own codes', async () => {
  const apps = await Promise.all(players.map(lobby));
  const host = apps[ALICE];

  await host.getByRole('button', { name: 'Host a game' }).click();
  await host.getByRole('button', { name: 'Invite seat 3' }).click();
  await host.getByRole('button', { name: 'Invite seat 4' }).click();

  const invites = new Set<string>();
  for (const guest of [BOB, CAROL, DAVE]) {
    const { seat } = players[guest];
    const invite = await codeValue(
      host.getByLabel(`Invite code for seat ${seat}`)
    );
    invites.add(invite);

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
    await expect(seatBox).toContainText(players[guest].name);
    await expect(status(app)).toHaveAttribute('data-phase', 'connected');
  }
  expect(invites.size).toBe(3);

  // Everyone learns the whole pod from the host.
  await expect(status(host)).toHaveText('Connected to Bob, Carol, Dave.');
  for (const guest of [BOB, CAROL, DAVE]) {
    const names = others(players[guest]).map((p) => p.name);
    for (const name of names) {
      await expect(status(apps[guest])).toContainText(name);
    }
    await expect(apps[guest].getByTestId('pod-players')).toContainText(
      'Seat 1: Alice (host)'
    );
    await expect(apps[guest].getByTestId('pod-players')).toContainText(
      `Seat 4: Dave`
    );
  }
});

test('a commander game on every board shows all four players', async () => {
  await Promise.all(
    players.map((player, i) =>
      player.app.evaluate(
        (_electron, seed) =>
          (
            globalThis as unknown as { testHooks: TestHooks }
          ).testHooks.openSampleCommanderPlayTest(seed),
        1000 + i
      )
    )
  );
  const boards = await Promise.all(players.map((p) => page(p, 'board.html')));
  const hands = await Promise.all(players.map((p) => page(p, 'hand.html')));

  // Opponents sit in turn order: the next seat after yours is leftmost.
  const expectedOrder: Record<number, string[]> = {
    [ALICE]: ['Bob', 'Carol', 'Dave'],
    [BOB]: ['Carol', 'Dave', 'Alice'],
    [CAROL]: ['Dave', 'Alice', 'Bob'],
    [DAVE]: ['Alice', 'Bob', 'Carol'],
  };
  for (const [i, board] of boards.entries()) {
    const sides = board.getByTestId('opponent-side');
    await expect(sides).toHaveCount(3);
    await expect
      .poll(() =>
        sides.evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-player-name'))
        )
      )
      .toEqual(expectedOrder[i]);
    for (const other of others(players[i])) {
      const side = opponentSide(board, other.name);
      await expect(side.getByTestId('opponent-life')).toHaveText('40');
      await expect(side).toHaveAttribute('data-seat', String(other.seat));
      await expect(
        side
          .getByTestId('opponent-command')
          .locator(`[data-testid="commander"][data-card-name="${DREADMAW}"]`)
      ).toHaveCount(1);
      await expect(side.getByTestId('opponent-mulligan-status')).toHaveCount(1);
    }
    // Commander damage can be recorded from every opponent's commander.
    const rows = board
      .getByTestId('commander-damage-taken')
      .getByTestId('commander-damage');
    await expect(rows).toHaveCount(3);
    for (const other of others(players[i])) {
      await expect(
        rows.and(
          board.locator(`[data-source-name="${DREADMAW} (${other.name})"]`)
        )
      ).toHaveCount(1);
    }
  }

  // Each player keeps and plays a card; every other board shows it.
  for (const [i, player] of players.entries()) {
    await hands[i].getByRole('button', { name: 'Keep' }).click();
    const card = hands[i].getByTestId('hand').getByTestId('card').first();
    const name = await card.getAttribute('data-card-name');
    await card.click();
    await expect(
      boards[i].getByTestId('battlefield').getByTestId('card')
    ).toHaveCount(1);
    for (const [j, board] of boards.entries()) {
      if (j === i) continue;
      const side = opponentSide(board, player.name);
      const field = side
        .getByTestId('opponent-battlefield')
        .getByTestId('card');
      await expect(field).toHaveCount(1);
      await expect(field).toHaveAttribute('data-card-name', name ?? '');
      await expect(side.getByTestId('opponent-hand-count')).toHaveAttribute(
        'data-count',
        '6'
      );
      await expect(side.getByTestId('opponent-mulligan-status')).toHaveCount(0);
    }
  }

  // Bob takes commander damage from Carol's commander; all boards see it.
  const more = boards[BOB].getByRole('button', {
    name: `More commander damage from ${DREADMAW} (Carol)`,
  });
  await more.click();
  await more.click();
  await expect(boards[BOB].getByTestId('life')).toHaveText('38');
  for (const i of [ALICE, CAROL, DAVE]) {
    const bob = opponentSide(boards[i], 'Bob');
    await expect(bob.getByTestId('opponent-life')).toHaveText('38');
    await expect(
      bob
        .getByTestId('opponent-commander-damage')
        .getByTestId('commander-damage')
    ).toHaveAttribute('data-damage', '2');
  }
});

test('a guest’s dice roll shows up on all four boards', async () => {
  const boards = await Promise.all(players.map((p) => page(p, 'board.html')));
  await boards[CAROL].getByRole('button', { name: 'Roll a d20' }).click();

  const latest = (board: Page) =>
    board.getByTestId('table-log').getByTestId('table-event').last();
  await expect(latest(boards[CAROL])).toHaveAttribute('data-by', 'Carol');
  const result = await latest(boards[CAROL]).getAttribute('data-result');
  expect(Number(result)).toBeGreaterThanOrEqual(1);
  expect(Number(result)).toBeLessThanOrEqual(20);
  for (const board of boards) {
    // After the entry's time stamp.
    await expect(latest(board)).toHaveText(
      new RegExp(` Carol rolled a d20: ${result ?? ''}$`)
    );
  }

  // The host flips a coin; everyone sees the same side.
  await boards[ALICE].getByRole('button', { name: 'Flip a coin' }).click();
  await expect(latest(boards[ALICE])).toHaveAttribute('data-by', 'Alice');
  const side = await latest(boards[ALICE]).getAttribute('data-result');
  for (const board of boards) {
    await expect(latest(board)).toHaveText(
      new RegExp(` Alice flipped a coin: ${side ?? ''}$`)
    );
  }
});

test('the host sends no hidden cards and relays guests unaltered', async () => {
  const [alice] = players;
  const hostWire = await wireOf(alice);
  const state = await gameState(alice);
  const { playerId: hostId } = await profileOf(alice);
  const me = state.players.find((p) => p.id === hostId);
  if (!me) throw new Error('no local player');
  const hidden = [...me.zones.hand, ...me.zones.library];
  const deckSize = Object.values(state.cards).filter(
    (c) => c.owner === hostId
  ).length;
  const publicZones: PublicZoneId[] = [
    'battlefield',
    'graveyard',
    'exile',
    'command',
  ];

  const own = hostWire.filter(
    (raw) => (JSON.parse(raw) as WireMessage).from === hostId
  );
  expect(own.length).toBeGreaterThan(10);
  for (const raw of own) {
    for (const id of hidden) expect(raw).not.toContain(JSON.stringify(id));
    const message = JSON.parse(raw) as WireMessage;
    if (message.kind !== 'public' || !message.view) continue;
    const { zones, handCount, libraryCount } = message.view;
    let shown = 0;
    for (const zone of publicZones) shown += zones[zone].length;
    expect(shown + handCount + libraryCount).toBe(deckSize);
  }

  // Everything else the host sent came from a guest, byte for byte.
  const relayed = hostWire.filter((raw) => !own.includes(raw));
  const guests = await Promise.all(
    players.slice(1).map(async (player) => ({
      id: (await profileOf(player)).playerId,
      wire: new Set(await wireOf(player)),
    }))
  );
  for (const guest of guests) {
    const theirs = relayed.filter(
      (raw) => (JSON.parse(raw) as WireMessage).from === guest.id
    );
    expect(
      theirs.filter((raw) => (JSON.parse(raw) as WireMessage).kind === 'public')
        .length
    ).toBeGreaterThan(0);
    for (const raw of theirs) expect(guest.wire.has(raw)).toBe(true);
  }
  expect(
    relayed.every((raw) =>
      guests.some((g) => g.id === (JSON.parse(raw) as WireMessage).from)
    )
  ).toBe(true);
});

test('a guest who leaves is removed from the other three boards', async () => {
  const dave = players[DAVE];
  const daveApp = await page(dave, 'app.html');
  await daveApp.getByRole('button', { name: 'Leave' }).click();
  await expect(status(daveApp)).toHaveAttribute('data-phase', 'idle');

  for (const player of [players[ALICE], players[BOB], players[CAROL]]) {
    const board = await page(player, 'board.html');
    await expect(board.getByTestId('opponent-side')).toHaveCount(2);
    await expect(opponentSide(board, 'Dave')).toHaveCount(0);
  }
  const daveBoard = await page(dave, 'board.html');
  await expect(daveBoard.getByTestId('opponent-side')).toHaveCount(0);

  const host = await page(players[ALICE], 'app.html');
  await expect(host.getByTestId('seat-4')).toHaveAttribute(
    'data-phase',
    'empty'
  );
  await expect(status(host)).toHaveText(/Dave left the game/);
  const bob = await page(players[BOB], 'app.html');
  await expect(status(bob)).toHaveText(/Dave left the game/);
  await expect(status(bob)).toHaveAttribute('data-phase', 'connected');

  // With two opponents left, each still has a compact row of two.
  const bobBoard = await page(players[BOB], 'board.html');
  await expect
    .poll(() =>
      bobBoard
        .getByTestId('opponent-side')
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-player-name'))
        )
    )
    .toEqual(['Carol', 'Alice']);
});

test('a player can rejoin an empty seat and catches up', async () => {
  const [host, daveApp] = await Promise.all([
    page(players[ALICE], 'app.html'),
    page(players[DAVE], 'app.html'),
  ]);
  await host.getByRole('button', { name: 'Invite seat 4' }).click();
  const invite = await codeValue(host.getByLabel('Invite code for seat 4'));
  await daveApp.getByRole('button', { name: 'Join a game' }).click();
  await daveApp.getByLabel('Invite to join').fill(invite);
  await daveApp.getByRole('button', { name: 'Join', exact: true }).click();
  const reply = await codeValue(daveApp.getByLabel('Your reply code'));
  await host.getByLabel('Reply code for seat 4').fill(reply);
  await host.getByRole('button', { name: 'Connect' }).click();
  await expect(host.getByTestId('seat-4')).toHaveAttribute(
    'data-phase',
    'connected',
    { timeout: 20_000 }
  );

  // Dave gets everyone's current table, not just the host's.
  const daveBoard = await page(players[DAVE], 'board.html');
  for (const name of ['Alice', 'Bob', 'Carol']) {
    await expect(
      opponentSide(daveBoard, name)
        .getByTestId('opponent-battlefield')
        .getByTestId('card')
    ).toHaveCount(1);
  }
  await expect(
    opponentSide(daveBoard, 'Bob').getByTestId('opponent-life')
  ).toHaveText('38');
  const bobBoard = await page(players[BOB], 'board.html');
  await expect(bobBoard.getByTestId('opponent-side')).toHaveCount(3);
  await expect(
    opponentSide(bobBoard, 'Dave')
      .getByTestId('opponent-battlefield')
      .getByTestId('card')
  ).toHaveCount(1);
});

test('when the host leaves, the pod ends for everyone', async () => {
  const host = await page(players[ALICE], 'app.html');
  await host.getByRole('button', { name: 'Leave' }).click();
  for (const player of [players[BOB], players[CAROL], players[DAVE]]) {
    const app = await page(player, 'app.html');
    await expect(status(app)).toHaveText(
      'The host (Alice) left the game. The pod has ended.'
    );
    const board = await page(player, 'board.html');
    await expect(board.getByTestId('opponent-side')).toHaveCount(0);
  }
});

test('no renderer console errors in any instance', () => {
  expect(players.flatMap((p) => p.errors)).toEqual([]);
});
