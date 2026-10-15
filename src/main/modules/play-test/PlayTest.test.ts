// @vitest-environment node
import type { LentCard, PrivateView, ShownToYou } from '@shared/game';
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

describe('PlayTest sideboard and companion', () => {
  const printing = (id: string, name: string) => ({
    id,
    name,
    typeLine: 'Creature — Cat Nightmare',
    layout: 'normal',
    power: '3',
    toughness: '2',
    loyalty: null,
    faces: [],
  });
  const printings: Record<string, ReturnType<typeof printing>> = {
    forest: printing('forest', 'Forest'),
    lurrus: printing('lurrus', 'Lurrus of the Dream-Den'),
    priest: printing('priest', 'Containment Priest'),
  };

  const openDeck = async () => {
    const playTest = new PlayTest({
      cardDb: {
        getCardById: ({ id }: { id: string }) => printings[id],
      } as never,
      deckDb: {
        getDeck: () => ({ name: 'Lurrus', format: 'constructed' }),
        getDeckCards: () => [
          { printingId: 'lurrus', qty: 1, board: 'companion' },
          { printingId: 'forest', qty: 20, board: 'main' },
          { printingId: 'priest', qty: 2, board: 'side' },
        ],
      } as never,
      playerId: 'p1',
      playerName: () => 'Alice',
      handInBoard: () => false,
    });
    const log: string[] = [];
    playTest.onLogEntry((text) => log.push(text));
    await playTest.handlers.startPlayTest(1);
    return { playTest, log, ...windowsOf(false) };
  };

  const names = (playTest: InstanceType<typeof PlayTest>, zone: string) => {
    const { zones } = playTest.gameState.players[0];
    return zones[zone as keyof typeof zones].map(
      (id) => playTest.gameState.cards[id].ref.name
    );
  };

  it('starts the companion in command and the rest of the sideboard aside', async () => {
    const { playTest } = await openDeck();
    expect(names(playTest, 'command')).toEqual(['Lurrus of the Dream-Den']);
    const [lurrus] = playTest.gameState.players[0].zones.command;
    expect(playTest.gameState.cards[lurrus].isCommander).toBeUndefined();
    expect(names(playTest, 'sideboard')).toEqual([
      'Containment Priest',
      'Containment Priest',
    ]);
    expect(names(playTest, 'library')).toHaveLength(13);
    expect(playTest.gameState.players[0].life).toBe(20);
  });

  it('sends the sideboard to the hand window only, and a count to the board', async () => {
    const { playTest, hand, board } = await openDeck();
    const view = (await playTest.handlers.getHandView()) as PrivateView;
    expect(view.sideboard?.map((card) => card.ref?.name)).toEqual([
      'Containment Priest',
      'Containment Priest',
    ]);
    expect(playTest.currentPublicView()?.sideboardCount).toBe(2);
    playTest.handlers.dispatch({
      type: 'moveCard',
      instanceId: playTest.gameState.players[0].zones.sideboard[0],
      to: 'hand',
    });
    expect(sentOn(hand, 'handView').at(-1)?.[1].sideboard).toHaveLength(1);
    expect(sentOn(board, 'handView')).toEqual([]);
    expect(JSON.stringify(sentOn(board, 'boardView'))).not.toContain(
      'Containment Priest'
    );
  });

  it('logs a wish by count, and a restart brings the sideboard back', async () => {
    const { playTest, log } = await openDeck();
    const [priest] = playTest.gameState.players[0].zones.sideboard;
    playTest.handlers.dispatch({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: [priest],
      to: 'hand',
    });
    expect(log.at(-1)).toBe('put 1 card from their sideboard into their hand');
    expect(names(playTest, 'sideboard')).toHaveLength(1);

    playTest.handlers.restartPlayTest();
    expect(names(playTest, 'sideboard')).toHaveLength(2);
    expect(names(playTest, 'command')).toEqual(['Lurrus of the Dream-Den']);
    expect(names(playTest, 'hand')).toHaveLength(7);
  });
});

describe('PlayTest saved games', () => {
  // Like the file store: writes wait for a flush, which a test calls
  // where the debounce would have fired.
  const memorySaves = () => {
    const files = new Map<string, string>();
    const pending = new Map<string, unknown>();
    return {
      files,
      pending,
      read: (key: string): unknown => {
        const file = files.get(key);
        return file === undefined ? null : JSON.parse(file);
      },
      schedule: (key: string, data: unknown) => {
        pending.set(key, data);
      },
      flush: () => {
        pending.forEach((data, key) => files.set(key, JSON.stringify(data)));
        pending.clear();
      },
      remove: (key: string) => {
        pending.delete(key);
        files.delete(key);
      },
      setAside: (key: string) => {
        const file = files.get(key);
        if (file === undefined) return null;
        files.delete(key);
        files.set(`${key}.unreadable`, file);
        return `/saves/${key}.unreadable.json`;
      },
    };
  };

  const launch = async (saves: ReturnType<typeof memorySaves>, seed = 7) => {
    const playTest = new PlayTest({
      cardDb: {} as never,
      deckDb: {} as never,
      playerId: 'p1',
      playerName: () => 'Alice',
      handInBoard: () => false,
      saves,
      appVersion: '9.9.9',
    });
    const send = vi.fn();
    playTest.linkControl({ send, peerName: () => 'Bob' });
    const log: string[] = [];
    playTest.onLogEntry((text) => log.push(text));
    const restoredLines: string[] = [];
    playTest.onLogRestored((lines) =>
      restoredLines.push(...lines.map((line) => line.text))
    );
    await playTest.openSampleDeck(seed);
    return { playTest, log, restoredLines, ...windowsOf(false) };
  };

  const withoutSeq = ({ seq: _seq, ...rest }: { seq: number }) => rest;

  const playSome = (playTest: InstanceType<typeof PlayTest>) => {
    const [a, b, c] = playTest.gameState.players[0].zones.hand;
    playTest.handlers.dispatch({
      type: 'moveCard',
      instanceId: a,
      to: 'battlefield',
    });
    playTest.handlers.dispatch({ type: 'tap', instanceId: a });
    playTest.handlers.dispatch({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: [b, c],
      to: 'graveyard',
    });
    playTest.handlers.undo();
  };

  it('saves as the game goes, and restores board, log and undo history', async () => {
    const saves = memorySaves();
    const first = await launch(saves);
    expect(first.playTest.handlers.getSavedGame()).toBeNull();
    playSome(first.playTest);
    const before = first.playTest.gameState;
    const undoBefore = first.playTest.handlers.getUndoState();
    expect(undoBefore).toEqual({ canUndo: true, canRedo: true });
    saves.flush();
    expect(saves.files.has('sample-constructed')).toBe(true);

    // A relaunch: a fresh play test opening the same deck.
    const second = await launch(saves, 99);
    expect(second.playTest.handlers.getSavedGame()).toEqual({
      kind: 'restore',
      deckName: 'Sample deck',
      savedAt: expect.any(Number) as number,
    });
    // New windows ask for it as they load; the hand never hears of it.
    expect(sentOn(second.hand, 'savedGame')).toHaveLength(0);
    const fresh = second.playTest.gameState;
    const started = sentOn(second.hand, 'gameStarted').length;

    second.playTest.handlers.restoreSavedGame();
    const after = second.playTest.gameState;
    expect(withoutSeq(after)).toEqual(withoutSeq(before));
    expect(after.seq).toBeGreaterThan(fresh.seq);
    expect(second.playTest.handlers.getUndoState()).toEqual(undoBefore);
    expect(second.playTest.handlers.getSavedGame()).toBeNull();
    expect(second.restoredLines).toEqual(first.log);
    expect(second.log.at(-1)).toBe('restored a saved game');
    // Dialogs open on the replaced game close.
    expect(sentOn(second.hand, 'gameStarted')).toHaveLength(started + 1);

    // The redo stack came back too.
    second.playTest.handlers.redo();
    const [, b] = before.players[0].zones.hand;
    expect(second.playTest.gameState.cards[b].zone).toBe('graveyard');
  });

  it('keeps the new game once the player plays on', async () => {
    const saves = memorySaves();
    const first = await launch(saves);
    playSome(first.playTest);
    saves.flush();
    const saved = saves.files.get('sample-constructed');

    const second = await launch(saves, 99);
    // Nothing is written over the save while it is on offer.
    expect(saves.files.get('sample-constructed')).toBe(saved);
    second.playTest.handlers.dispatch({ type: 'untapAll', playerId: 'p1' });
    second.playTest.handlers.dispatch({
      type: 'draw',
      playerId: 'p1',
      count: 1,
    });
    expect(second.playTest.handlers.getSavedGame()).toBeNull();
    saves.flush();
    expect(saves.files.get('sample-constructed')).not.toBe(saved);
    second.playTest.handlers.restoreSavedGame();
    expect(second.playTest.gameState.players[0].zones.hand).toHaveLength(8);
  });

  it('keeps the save on disk when dismissed, until the new game changes', async () => {
    const saves = memorySaves();
    playSome((await launch(saves)).playTest);
    saves.flush();
    const saved = saves.files.get('sample-constructed');

    const second = await launch(saves, 99);
    second.playTest.handlers.dismissSavedGame();
    expect(second.playTest.handlers.getSavedGame()).toBeNull();
    expect(saves.files.get('sample-constructed')).toBe(saved);
    second.playTest.handlers.dispatch({
      type: 'draw',
      playerId: 'p1',
      count: 1,
    });
    saves.flush();
    expect(saves.files.get('sample-constructed')).not.toBe(saved);
  });

  it('starts a new game with a message when the save is damaged or too new', async () => {
    const saves = memorySaves();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    saves.files.set('sample-constructed', '{"kind":"mtg-play-mat/game"}');
    const damaged = await launch(saves);
    expect(damaged.playTest.handlers.getSavedGame()).toEqual({
      kind: 'failed',
      message: expect.stringMatching(
        /damaged.*new game was started.*kept as \/saves\/sample-constructed\.unreadable\.json/
      ) as string,
    });
    // Moved aside, so the new game doesn't write over it.
    expect(saves.files.get('sample-constructed.unreadable')).toBe(
      '{"kind":"mtg-play-mat/game"}'
    );
    expect(damaged.playTest.gameState.players[0].zones.hand).toHaveLength(7);
    damaged.playTest.handlers.dismissSavedGame();
    expect(damaged.playTest.handlers.getSavedGame()).toBeNull();

    // The new game's own save would otherwise land first.
    saves.pending.clear();
    saves.files.set(
      'sample-constructed',
      JSON.stringify({
        kind: 'mtg-play-mat/game',
        version: 0,
        appVersion: '0.1.0',
      })
    );
    const old = await launch(saves);
    expect(old.playTest.handlers.getSavedGame()).toEqual({
      kind: 'failed',
      message: expect.stringMatching(/version 0\.1\.0/) as string,
    });
    warn.mockRestore();
  });

  it('refuses to restore while a permanent is borrowed', async () => {
    const saves = memorySaves();
    playSome((await launch(saves)).playTest);
    const second = await launch(saves, 99);
    second.playTest.receiveControl('bob', 'Bob', {
      op: 'give',
      card: borrowed,
    });
    const before = second.playTest.gameState;

    second.playTest.handlers.restoreSavedGame();
    expect(second.playTest.gameState).toBe(before);
    expect(second.playTest.handlers.getSavedGame()).toEqual(
      expect.objectContaining({
        kind: 'restore',
        refused: expect.stringMatching(/only your own game/) as string,
      })
    );
  });
});

describe('PlayTest saved games, keeping the file right', () => {
  const store = () => {
    const files = new Map<string, unknown>();
    const pending = new Map<string, unknown>();
    const flushes: string[][] = [];
    return {
      files,
      pending,
      flushes,
      read: (key: string): unknown => files.get(key) ?? null,
      schedule: (key: string, data: unknown) => {
        pending.set(key, JSON.parse(JSON.stringify(data)));
      },
      flush: () => {
        flushes.push([...pending.keys()]);
        pending.forEach((data, key) => files.set(key, data));
        pending.clear();
      },
      remove: (key: string) => {
        pending.delete(key);
        files.delete(key);
      },
      setAside: () => null,
    };
  };

  const open = async (saves: ReturnType<typeof store>) => {
    const playTest = new PlayTest({
      cardDb: {} as never,
      deckDb: {} as never,
      playerId: 'p1',
      playerName: () => 'Alice',
      handInBoard: () => false,
      saves,
    });
    await playTest.openSampleDeck(7);
    return playTest;
  };

  const logOf = (data: unknown) => (data as { log: unknown[] }).log;

  it('saves the last game before switching to another deck', async () => {
    const saves = store();
    const playTest = await open(saves);
    playTest.handlers.dispatch({ type: 'draw', playerId: 'p1', count: 1 });
    expect(saves.files.has('sample-constructed')).toBe(false);

    await playTest.openSampleDeck(8, 'commander');
    expect(saves.flushes.at(-1)).toContain('sample-constructed');
    expect(logOf(saves.files.get('sample-constructed'))).toHaveLength(4);
  });

  it('writes a restarted game over the offered save', async () => {
    const saves = store();
    const first = await open(saves);
    first.handlers.dispatch({ type: 'draw', playerId: 'p1', count: 1 });
    const second = await open(saves);
    expect(second.handlers.getSavedGame()).not.toBeNull();
    expect(logOf(saves.files.get('sample-constructed'))).toHaveLength(4);

    second.handlers.restartPlayTest();
    saves.flush();
    expect(second.handlers.getSavedGame()).toBeNull();
    expect(logOf(saves.files.get('sample-constructed'))).toHaveLength(3);
  });

  it('stops saving a game whose deck was deleted', async () => {
    const saves = store();
    const playTest = await open(saves);
    saves.flush();
    playTest.forgetSave('sample-constructed');
    saves.remove('sample-constructed');
    playTest.handlers.dispatch({ type: 'draw', playerId: 'p1', count: 1 });
    playTest.flushSaves();
    expect(saves.files.has('sample-constructed')).toBe(false);
    // Another deck's key leaves this game alone.
    const other = await open(saves);
    other.forgetSave('deck-3');
    other.handlers.dispatch({ type: 'draw', playerId: 'p1', count: 1 });
    other.flushSaves();
    expect(saves.files.has('sample-constructed')).toBe(true);
  });

  it('keeps a very long log line short, and the save restorable', async () => {
    const saves = store();
    const first = await open(saves);
    first.addLogEntry(`milled 60 cards: ${'Forest, '.repeat(300)}`);
    first.flushSaves();
    const { lines } = saves.files.get('sample-constructed') as {
      lines: { text: string }[];
    };
    expect(lines.at(-1)?.text.length).toBeLessThanOrEqual(300);

    const second = await open(saves);
    expect(second.handlers.getSavedGame()).toEqual(
      expect.objectContaining({ kind: 'restore' })
    );
  });
});
