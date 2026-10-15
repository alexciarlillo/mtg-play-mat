// @vitest-environment node
import type { LentCard } from '@shared/game';
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
