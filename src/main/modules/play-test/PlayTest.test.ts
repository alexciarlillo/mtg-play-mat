// @vitest-environment node
import type { LentCard, ShownToYou } from '@shared/game';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  screen: {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
  },
  ipcMain: { handle: vi.fn() },
}));

const fakeWindow = () => ({
  on: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  close: vi.fn(),
  isDestroyed: () => false,
  webContents: { send: vi.fn(), on: vi.fn(), isLoading: () => false },
});

vi.mock('../../windows', () => ({
  createWindow: vi.fn(() => fakeWindow()),
  whenLoaded: vi.fn(async () => true),
}));

const { default: PlayTest } = await import('./PlayTest');

const borrowed: LentCard = {
  instanceId: 'bob:0',
  ref: {
    id: 'id-bear',
    name: 'Borrowed Bear',
    typeLine: 'Creature — Bear',
    faces: [{ name: 'Borrowed Bear', typeLine: 'Creature — Bear' }],
  },
  isToken: false,
  tapped: true,
  faceDown: false,
  faceIndex: 0,
  counters: {},
};

const open = async () => {
  const playTest = new PlayTest({
    cardDb: {} as never,
    deckDb: {} as never,
    playerId: 'p1',
    playerName: () => 'Alice',
    handInBoard: () => false,
  });
  const send = vi.fn();
  playTest.linkControl({ send, peerName: () => 'Bob' });
  const log: string[] = [];
  playTest.onLogEntry((text) => log.push(text));
  await playTest.openSampleDeck(7);
  return { playTest, send, log };
};

describe('PlayTest batch moves with a borrowed permanent', () => {
  it('logs its own line, then the return, and cannot be undone', async () => {
    const { playTest, send, log } = await open();
    playTest.receiveControl('bob', 'Bob', { op: 'give', card: borrowed });
    const [own] = playTest.gameState.players[0].zones.hand;
    const ownName = playTest.gameState.cards[own].ref.name;
    playTest.handlers.dispatch({
      type: 'moveCard',
      instanceId: own,
      to: 'battlefield',
    });
    log.length = 0;

    playTest.handlers.dispatch({
      type: 'moveAll',
      playerId: 'p1',
      from: 'battlefield',
      to: 'graveyard',
    });

    const state = playTest.gameState;
    expect(state.cards[borrowed.instanceId]).toBeUndefined();
    expect(state.cards[own].zone).toBe('graveyard');
    expect(log).toEqual([
      `put 1 permanent from the battlefield into their graveyard: ${ownName}`,
      "put Borrowed Bear into Bob's graveyard",
    ]);
    expect(send).toHaveBeenCalledWith(
      'bob',
      expect.objectContaining({
        op: 'return',
        instanceId: borrowed.instanceId,
        to: 'graveyard',
      })
    );
    // The return crossed into another game, so nothing before it undoes.
    expect(playTest.handlers.getUndoState()).toEqual({
      canUndo: false,
      canRedo: false,
    });
    playTest.handlers.undo();
    expect(playTest.gameState.cards[own].zone).toBe('graveyard');
  });
});

describe('PlayTest look at top', () => {
  it('is private, tells both windows, and is off in a new game', async () => {
    const { playTest, log } = await open();
    const publicBefore = playTest.currentPublicView();
    expect(playTest.handlers.getLookAtTop()).toBe(false);

    playTest.handlers.setLookAtTop(true);
    expect(playTest.handlers.getLookAtTop()).toBe(true);
    const board = playTest.boardWindow as unknown as ReturnType<
      typeof fakeWindow
    >;
    expect(board.webContents.send).toHaveBeenCalledWith('lookAtTop', true);
    // Nothing public changes, and nothing is logged.
    expect(playTest.currentPublicView()).toEqual(publicBefore);
    expect(log.some((line) => /top/.test(line))).toBe(false);
    expect(() => playTest.handlers.setLookAtTop('yes' as never)).toThrow();

    playTest.handlers.restartPlayTest();
    expect(playTest.handlers.getLookAtTop()).toBe(false);
    expect(board.webContents.send).toHaveBeenCalledWith('lookAtTop', false);
  });
});

const { createWindow } = await import('../../windows');

type FakeWindow = ReturnType<typeof fakeWindow>;

// The board, then the hand (absent when docked), as the play test made
// them for its most recent opening.
const windowsOf = (docked: boolean) => {
  const made = vi
    .mocked(createWindow)
    .mock.results.map((r) => r.value as FakeWindow);
  return docked
    ? { board: made.at(-1) as FakeWindow, hand: null }
    : { board: made.at(-2) as FakeWindow, hand: made.at(-1) as FakeWindow };
};

const sentOn = (window: FakeWindow | null, channel: string) =>
  (window?.webContents.send.mock.calls ?? []).filter(([c]) => c === channel);

const openForReveals = async ({
  docked = false,
  ready = true,
}: { docked?: boolean; ready?: boolean } = {}) => {
  const playTest = new PlayTest({
    cardDb: {} as never,
    deckDb: {} as never,
    playerId: 'p1',
    playerName: () => 'Alice',
    handInBoard: () => docked,
  });
  const send = vi.fn();
  playTest.linkReveal({
    send,
    targets: () => [
      ready
        ? { playerId: 'bob', name: 'Bob', ready: true }
        : {
            playerId: 'bob',
            name: 'Bob',
            ready: false,
            why: 'needs a newer version',
          },
    ],
  });
  const log: string[] = [];
  playTest.onLogEntry((text) => log.push(text));
  await playTest.openSampleDeck(7);
  return { playTest, send, log, ...windowsOf(docked) };
};

describe('PlayTest reveals to one player', () => {
  it('sends the cards to that player alone, and tells the table only who and how many', async () => {
    const { playTest, send, log, board, hand } = await openForReveals();
    const [card] = playTest.gameState.players[0].zones.hand;
    const name = playTest.gameState.cards[card].ref.name;
    const before = playTest.gameState;

    playTest.handlers.revealTo({ to: 'bob', source: 'card', instanceId: card });

    expect(send).toHaveBeenCalledWith('bob', {
      op: 'show',
      id: expect.any(Number),
      source: 'card',
      cards: [before.cards[card].ref],
    });
    expect(log.at(-1)).toBe('revealed a card from their hand to Bob');
    const view = playTest.currentPublicView();
    expect(view?.showing).toEqual({ to: 'bob', source: 'card', count: 1 });
    expect(playTest.handlers.getHandView()).toMatchObject({
      showing: { to: 'bob', count: 1 },
    });
    expect(JSON.stringify(view)).not.toContain(name);
    // A side channel: the game itself, and so undo, never saw it.
    expect(playTest.gameState).toBe(before);
    // The player's own record goes to the hand window only.
    expect(sentOn(hand, 'privateLog').at(-1)?.[1]).toEqual([
      expect.objectContaining({
        text: `You showed Bob a card from their hand: ${name}`,
      }),
    ]);
    expect(sentOn(board, 'privateLog')).toEqual([]);
    expect(JSON.stringify(board.webContents.send.mock.calls)).not.toContain(
      name
    );
  });

  it('ends at the next action, and tells the player shown', async () => {
    const { playTest, send } = await openForReveals();
    playTest.handlers.revealTo({ to: 'bob', source: 'hand' });
    expect(playTest.currentPublicView()?.showing).toMatchObject({
      source: 'hand',
      count: 7,
    });
    const first = (send.mock.calls[0][1] as { id: number }).id;
    playTest.handlers.dispatch({
      type: 'adjustLife',
      playerId: 'p1',
      delta: 1,
    });
    expect(send).toHaveBeenLastCalledWith('bob', { op: 'end', id: first });
    expect(playTest.currentPublicView()?.showing).toBeNull();

    playTest.handlers.revealTo({ to: 'bob', source: 'libraryTop', count: 2 });
    playTest.handlers.stopShowing();
    expect(send).toHaveBeenLastCalledWith('bob', {
      op: 'end',
      id: first + 1,
    });
  });

  it('lets a search show its picks first, then move them as one action', async () => {
    const { playTest, send, log } = await openForReveals();
    const [a, b] = playTest.gameState.players[0].zones.library;
    const refs = [a, b].map((id) => playTest.gameState.cards[id].ref);
    playTest.handlers.revealTo(
      { to: 'bob', source: 'search', instanceIds: [a, b] },
      {
        type: 'searchLibrary',
        playerId: 'p1',
        picks: [
          { instanceId: a, to: 'hand' },
          { instanceId: b, to: 'top' },
        ],
        shuffle: true,
      }
    );
    expect(send).toHaveBeenCalledWith('bob', {
      op: 'show',
      id: expect.any(Number),
      source: 'search',
      cards: refs,
    });
    expect(playTest.gameState.cards[a].zone).toBe('hand');
    // Shown only once the search has gone through.
    expect(log.slice(-2)).toEqual([
      'searched their library, then shuffled, and put a card into their ' +
        'hand and a card on top of their library',
      'revealed 2 cards they searched for to Bob',
    ]);
    // The search that showed them doesn't end the showing.
    expect(playTest.currentPublicView()?.showing).toMatchObject({ count: 2 });
  });

  it('sends nothing to a player who can’t take it, or for stale cards', async () => {
    const greyed = await openForReveals({ ready: false });
    greyed.playTest.handlers.revealTo({ to: 'bob', source: 'hand' });
    expect(greyed.send).not.toHaveBeenCalled();
    // A search meant to be shown doesn't quietly go ahead without it.
    const state = greyed.playTest.gameState;
    const [pick] = state.players[0].zones.library;
    greyed.playTest.handlers.revealTo(
      { to: 'bob', source: 'search', instanceIds: [pick] },
      {
        type: 'searchLibrary',
        playerId: 'p1',
        picks: [{ instanceId: pick, to: 'hand' }],
        shuffle: true,
      }
    );
    expect(greyed.playTest.gameState).toBe(state);
    expect(greyed.send).not.toHaveBeenCalled();
    expect(sentOn(greyed.hand, 'privateLog').at(-1)?.[1]).toContainEqual(
      expect.objectContaining({
        notice: true,
        text: "Bob can't be shown cards now, so nothing was revealed or moved.",
      })
    );

    const { playTest, send } = await openForReveals();
    const [inLibrary] = playTest.gameState.players[0].zones.library;
    playTest.handlers.revealTo({
      to: 'bob',
      source: 'card',
      instanceId: inLibrary,
    });
    playTest.handlers.revealTo({
      to: 'bob',
      source: 'faceDown',
      instanceId: inLibrary,
    });
    expect(send).not.toHaveBeenCalled();
    expect(() =>
      playTest.handlers.revealTo({ to: 'bob', source: 'graveyard' } as never)
    ).toThrow(/bad reveal/);
  });

  it('shows a face-down permanent only to its owner’s choice', async () => {
    const { playTest, send } = await openForReveals();
    const [card] = playTest.gameState.players[0].zones.hand;
    playTest.handlers.dispatch({
      type: 'moveCard',
      instanceId: card,
      to: 'battlefield',
      faceDown: true,
    });
    playTest.handlers.revealTo({
      to: 'bob',
      source: 'faceDown',
      instanceId: card,
    });
    expect(send).toHaveBeenCalledWith(
      'bob',
      expect.objectContaining({ source: 'faceDown' })
    );
    expect(playTest.currentPublicView()?.zones.battlefield[0].ref).toBeNull();
  });
});

describe('PlayTest cards shown to this player', () => {
  const bear = borrowed.ref;

  it('keeps them for the hand window until dismissed, never the board', async () => {
    const { playTest, board, hand } = await openForReveals();
    playTest.receiveReveal('bob', 'Bob', {
      op: 'show',
      id: 4,
      source: 'hand',
      cards: [bear],
    });
    expect(playTest.handlers.getShownToYou()).toEqual([
      expect.objectContaining({
        key: 'bob:4',
        fromName: 'Bob',
        cards: [bear],
        ended: false,
      }),
    ]);
    expect(sentOn(hand, 'shownToYou')).toHaveLength(1);
    expect(sentOn(hand, 'privateLog').at(-1)?.[1]).toEqual([
      expect.objectContaining({
        text: 'Bob showed you their hand (a card): Borrowed Bear',
      }),
    ]);
    expect(JSON.stringify(board.webContents.send.mock.calls)).not.toContain(
      'Borrowed Bear'
    );

    playTest.receiveReveal('bob', 'Bob', { op: 'end', id: 4 });
    const [entry] = playTest.handlers.getShownToYou() as ShownToYou[];
    expect(entry.ended).toBe(true);

    // Bob leaving ends whatever he was still showing.
    playTest.receiveReveal('bob', 'Bob', {
      op: 'show',
      id: 5,
      source: 'card',
      cards: [bear],
    });
    playTest.peerGone('bob', 'Bob');
    expect(
      (playTest.handlers.getShownToYou() as ShownToYou[]).map((e) => e.ended)
    ).toEqual([true, true]);
    playTest.handlers.dismissShown('bob:5');

    playTest.handlers.dismissShown('bob:4');
    expect(playTest.handlers.getShownToYou()).toEqual([]);
    expect(sentOn(hand, 'shownToYou').at(-1)?.[1]).toEqual([]);
  });

  it('shows them on the board only when it hosts the hand', async () => {
    const { playTest, board } = await openForReveals({ docked: true });
    playTest.receiveReveal('bob', 'Bob', {
      op: 'show',
      id: 1,
      source: 'card',
      cards: [bear],
    });
    expect(sentOn(board, 'shownToYou')).toHaveLength(1);
  });

  it('is never added to the game or the table log', async () => {
    const { playTest, log } = await openForReveals();
    const state = playTest.gameState;
    const lines = log.length;
    playTest.receiveReveal('bob', 'Bob', {
      op: 'show',
      id: 1,
      source: 'card',
      cards: [bear],
    });
    expect(playTest.gameState).toBe(state);
    expect(log).toHaveLength(lines);
  });
});

describe('PlayTest reveal ids', () => {
  it('start somewhere random each run', async () => {
    const one = await openForReveals();
    const two = await openForReveals();
    one.playTest.handlers.revealTo({ to: 'bob', source: 'hand' });
    two.playTest.handlers.revealTo({ to: 'bob', source: 'hand' });
    const idOf = (send: typeof one.send) =>
      (send.mock.calls[0][1] as { id: number }).id;
    expect(idOf(one.send)).not.toBe(idOf(two.send));
  });
});

describe('PlayTest known cards', () => {
  const lib = (playTest: InstanceType<typeof PlayTest>) =>
    playTest.gameState.players[0].zones.library;
  const nameOf = (playTest: InstanceType<typeof PlayTest>, id: string) =>
    playTest.gameState.cards[id].ref.name;
  const known = (playTest: InstanceType<typeof PlayTest>) => {
    const view = playTest.handlers.getHandView() as {
      known?: { top: { ref: { name: string } }[]; bottom: unknown[] };
    } | null;
    return view?.known?.top.map((card) => card.ref.name);
  };
  const scry1 = (playTest: InstanceType<typeof PlayTest>, keep: boolean) => {
    const [top] = lib(playTest);
    playTest.handlers.dispatch({
      type: 'arrangeTop',
      playerId: 'p1',
      top: keep ? [top] : [],
      bottom: keep ? [] : [top],
      graveyard: [],
      exile: [],
      hand: [],
    });
  };

  it('learns from a look, keeps it through undo, and forgets on a shuffle', async () => {
    const { playTest, hand, board } = await openForReveals();
    const [first, second] = lib(playTest);
    expect(known(playTest)).toEqual([]);

    // Keeping the card on top changes nothing, but it was seen.
    scry1(playTest, true);
    expect(known(playTest)).toEqual([nameOf(playTest, first)]);

    playTest.handlers.dispatch({ type: 'draw', playerId: 'p1', count: 1 });
    expect(known(playTest)).toEqual([]);
    playTest.handlers.undo();
    expect(known(playTest)).toEqual([nameOf(playTest, first)]);

    playTest.handlers.dispatch({
      type: 'arrangeTop',
      playerId: 'p1',
      top: [second, first],
      bottom: [],
      graveyard: [],
      exile: [],
      hand: [],
    });
    expect(known(playTest)).toEqual([
      nameOf(playTest, second),
      nameOf(playTest, first),
    ]);

    playTest.handlers.dispatch({ type: 'shuffle', playerId: 'p1' });
    expect(known(playTest)).toEqual([]);
    playTest.handlers.undo();
    expect(known(playTest)).toHaveLength(2);

    // Only the hand window hears it; the board view never carries it.
    const handViews = sentOn(hand, 'handView');
    expect(handViews.at(-1)?.[1]).toHaveProperty('known');
    expect(sentOn(board, 'handView')).toEqual([]);
    expect(JSON.stringify(sentOn(board, 'boardView'))).not.toContain('"known"');
    expect(playTest.currentPublicView()).not.toHaveProperty('known');
  });

  it('goes to the board only when it hosts the hand', async () => {
    const { playTest, board } = await openForReveals({ docked: true });
    scry1(playTest, false);
    expect(sentOn(board, 'handView').at(-1)?.[1]).toHaveProperty('known');
  });

  it('learns the top card the player always looks at', async () => {
    const { playTest } = await openForReveals();
    const [first] = lib(playTest);
    playTest.handlers.setLookAtTop(true);
    expect(known(playTest)).toEqual([nameOf(playTest, first)]);
    playTest.handlers.setLookAtTop(false);
    expect(known(playTest)).toEqual([nameOf(playTest, first)]);
  });

  it('learns the top cards shown to one player', async () => {
    const { playTest } = await openForReveals();
    const [first, second] = lib(playTest);
    playTest.handlers.revealTo({ to: 'bob', source: 'libraryTop', count: 2 });
    expect(known(playTest)).toEqual([
      nameOf(playTest, first),
      nameOf(playTest, second),
    ]);
  });

  it('starts empty in a new game', async () => {
    const { playTest } = await openForReveals();
    scry1(playTest, true);
    playTest.handlers.restartPlayTest();
    expect(known(playTest)).toEqual([]);
  });
});

describe('PlayTest seen list', () => {
  const bear = borrowed.ref;
  // Bob's view, built from the local one, showing cards or nothing.
  const bob = (
    playTest: InstanceType<typeof PlayTest>,
    cards: (typeof bear)[] | null
  ) => {
    const base = playTest.currentPublicView();
    return {
      playerId: 'bob',
      name: 'Bob',
      view: base && {
        ...base,
        playerId: 'bob',
        revealed: cards && { source: 'hand' as const, cards },
      },
    };
  };

  it('keeps public reveals for the board after they end, and clears on a new game', async () => {
    const { playTest, board, hand } = await openForReveals();
    playTest.notePeers([bob(playTest, [bear])]);
    playTest.notePeers([bob(playTest, [bear])]);
    playTest.notePeers([bob(playTest, null)]);
    expect(playTest.handlers.getSeenList()).toEqual([
      expect.objectContaining({
        player: 'bob',
        playerName: 'Bob',
        to: 'everyone',
        source: 'hand',
        cards: [bear],
      }),
    ]);
    expect(sentOn(board, 'seenList')).toHaveLength(1);
    expect(sentOn(hand, 'seenList')).toEqual([]);

    playTest.handlers.restartPlayTest();
    expect(playTest.handlers.getSeenList()).toEqual([]);
    expect(sentOn(board, 'seenList').at(-1)?.[1]).toEqual([]);
  });

  it('lists cards shown to this player only where the hand is', async () => {
    const { playTest, board, hand } = await openForReveals();
    playTest.receiveReveal('bob', 'Bob', {
      op: 'show',
      id: 3,
      source: 'card',
      cards: [bear],
    });
    playTest.handlers.dismissShown('bob:3');
    expect(playTest.handlers.getSeenByYou()).toEqual([
      expect.objectContaining({ to: 'you', source: 'card', cards: [bear] }),
    ]);
    expect(playTest.handlers.getSeenList()).toEqual([]);
    expect(sentOn(hand, 'seenByYou')).toHaveLength(1);
    expect(JSON.stringify(board.webContents.send.mock.calls)).not.toContain(
      'Borrowed Bear'
    );
  });

  it('clears when the table changes', async () => {
    const { playTest } = await openForReveals();
    playTest.notePeers([bob(playTest, [bear])]);
    playTest.forgetSeen();
    expect(playTest.handlers.getSeenList()).toEqual([]);
  });
});
