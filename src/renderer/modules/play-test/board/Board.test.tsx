import type { CardView, PublicView, SeenEntry } from '@shared/game';
import type { OpponentState } from '@shared/net/remoteViews';
import type { RevealTarget } from '@shared/net/revealTargets';
import {
  defaultSettings,
  MIN_OPPONENT_ROW_HEIGHT,
  type Settings,
} from '@shared/settings';
import type { BoardMenuCommand } from '@shared/types/playTest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import type { ViewStore } from '../viewStore';
import Board from './Board';
import { fieldBounds } from './layout';

const view: PublicView = {
  seq: 1,
  playerId: 'p1',
  name: 'You',
  life: 20,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: { battlefield: [], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
  turn: 3,
  phase: 'main1',
};

const opponent: OpponentState = {
  seq: 1,
  selfSeat: null,
  peers: [
    {
      info: { playerId: 'p2', name: 'Bob', appVersion: '0.0.0' },
      seat: null,
      view: { ...view, playerId: 'p2', name: 'Bob', turn: 5 },
      matId: null,
    },
  ],
  log: [],
};

const storeOf = <V,>(value: V): ViewStore<V> => ({
  subscribe: () => () => {},
  getSnapshot: () => value,
});

const never = () => new Promise(() => {});
let pushSettings: (next: Settings) => void;
let pushMenuCommand: (command: BoardMenuCommand) => void;
let pushGameStarted: () => void;
let pushUndoState: (next: { canUndo: boolean; canRedo: boolean }) => void;
let api: Record<string, ReturnType<typeof vi.fn>>;
let revealTargets: RevealTarget[] = [];
let pushRevealTargets: (next: RevealTarget[]) => void;
const seenList: SeenEntry[] = [];

// A store whose view can be replaced, as main and peers push new ones.
const pushable = <V,>(initial: V) => {
  let value = initial;
  const listeners = new Set<() => void>();
  const store: ViewStore<V> = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => value,
  };
  const push = (next: V) => {
    value = next;
    act(() => listeners.forEach((listener) => listener()));
  };
  return { store, push };
};

const renderBoard = (
  initial: Settings,
  own: PublicView | ViewStore<PublicView> = view,
  others: OpponentState | ViewStore<OpponentState> = opponent
) => {
  api = {
    dispatch: vi.fn(async () => {}),
    undo: vi.fn(async () => {}),
    redo: vi.fn(async () => {}),
    restartPlayTest: vi.fn(async () => {}),
    openHandDialog: vi.fn(async () => {}),
    getLookAtTop: vi.fn(async () => false),
    setLookAtTop: vi.fn(async () => {}),
    onLookAtTop: vi.fn(() => () => {}),
    getRevealTargets: vi.fn(async () => revealTargets),
    onRevealTargets: vi.fn((listener: (next: RevealTarget[]) => void) => {
      pushRevealTargets = listener;
      return () => {};
    }),
    revealTo: vi.fn(async () => {}),
    getSeenList: vi.fn(async () => seenList),
    onSeenList: vi.fn(() => () => {}),
  };
  Object.assign(window, {
    api: {
      ...api,
      getSettings: () => Promise.resolve(initial),
      onSettingsChanged: (listener: (next: Settings) => void) => {
        pushSettings = listener;
        return () => {};
      },
      getUndoState: never,
      onUndoState: (listener: typeof pushUndoState) => {
        pushUndoState = listener;
        return () => {};
      },
      getCommanderPrompts: never,
      onCommanderPrompts: () => () => {},
      getSavedGame: never,
      onSavedGame: () => () => {},
      onGameStarted: (listener: () => void) => {
        pushGameStarted = listener;
        return () => {};
      },
      onBoardMenuCommand: (listener: typeof pushMenuCommand) => {
        pushMenuCommand = listener;
        return () => {};
      },
    },
  });
  render(
    <ContextMenuProvider>
      <Board
        store={'getSnapshot' in own ? own : storeOf(own)}
        opponent={'getSnapshot' in others ? others : storeOf(others)}
      />
    </ContextMenuProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
});

describe('Board turn tracking', () => {
  it('hides the turn panel and opponent turn by default', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    expect(screen.queryByTestId('turn-panel')).toBeNull();
    expect(screen.queryByTestId('opponent-turn')).toBeNull();
    expect(screen.getByTestId('opponent-side')).toBeInTheDocument();
  });

  it('follows the setting live', async () => {
    renderBoard({ ...defaultSettings, turnTracking: true });
    expect(await screen.findByTestId('turn-panel')).toBeInTheDocument();
    expect(screen.getByTestId('turn')).toHaveTextContent('3');
    expect(screen.getByTestId('opponent-turn')).toHaveTextContent('Turn 5');

    act(() => pushSettings({ ...defaultSettings, turnTracking: false }));
    expect(screen.queryByTestId('turn-panel')).toBeNull();
    expect(screen.queryByTestId('opponent-turn')).toBeNull();

    act(() => pushSettings({ ...defaultSettings, turnTracking: true }));
    expect(screen.getByTestId('turn-panel')).toBeInTheDocument();
  });
});

describe('Board opponent row', () => {
  const podOf = (names: string[]): OpponentState => ({
    ...opponent,
    peers: names.map((name, seat) => ({
      info: { playerId: `p${seat + 2}`, name, appVersion: '0.0.0' },
      seat: seat + 1,
      view: { ...view, playerId: `p${seat + 2}`, name },
      matId: null,
    })),
  });

  const drag = (by: number) => {
    const handle = screen.getByTestId('opponents-resize');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 400 + by });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 400 + by });
  };

  it('takes the saved height, whatever the seat count', async () => {
    for (const names of [['Bob'], ['Bob', 'Carol'], ['Bob', 'Carol', 'Dave']]) {
      cleanup();
      renderBoard({ ...defaultSettings, opponentRow: 260 }, view, podOf(names));
      await act(async () => {});
      const row = screen.getByTestId('opponents');
      expect(row.style.height).toBe('260px');
      // The board below always keeps its share, however tall the row.
      expect(row.style.maxHeight).toBe('60%');
    }
  });

  it('saves a dragged height and shows it while dragging', async () => {
    renderBoard(defaultSettings, view, podOf(['Bob', 'Carol']));
    const updateSettings = vi.fn(async (patch: Partial<Settings>) => ({
      ...defaultSettings,
      ...patch,
    }));
    Object.assign(window.api, { updateSettings });
    await act(async () => {});

    const row = screen.getByTestId('opponents');
    // jsdom lays nothing out, so the drag starts from a measured zero.
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      height: 320,
    } as DOMRect);

    const handle = screen.getByTestId('opponents-resize');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 460 });
    expect(row.style.height).toBe('380px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 460 });
    expect(updateSettings).toHaveBeenCalledWith({ opponentRow: 380 });
  });

  it('clamps a drag to the row minimum and its share of the window', async () => {
    renderBoard(defaultSettings, view, podOf(['Bob', 'Carol']));
    const updateSettings = vi.fn(async (patch: Partial<Settings>) => ({
      ...defaultSettings,
      ...patch,
    }));
    Object.assign(window.api, { updateSettings });
    await act(async () => {});

    const row = screen.getByTestId('opponents');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      height: 320,
    } as DOMRect);

    drag(-5000);
    expect(row.style.height).toBe(`${MIN_OPPONENT_ROW_HEIGHT}px`);
    drag(5000);
    const share = Math.round(window.innerHeight * 0.6);
    expect(row.style.height).toBe(`${share}px`);
    expect(updateSettings).toHaveBeenLastCalledWith({ opponentRow: share });
  });
});

describe('Board sideboard', () => {
  it('shows only a count of your sideboard, when you have one', async () => {
    renderBoard(defaultSettings, { ...view, sideboardCount: 3 });
    await act(async () => {});
    expect(screen.getByTestId('sideboard-count')).toHaveTextContent(
      'Sideboard 3'
    );
  });

  it('shows nothing without a sideboard', async () => {
    renderBoard(defaultSettings, { ...view, sideboardCount: 0 });
    await act(async () => {});
    expect(screen.queryByTestId('sideboard-count')).toBeNull();
  });
});

describe('Board library activity', () => {
  it('shows no badges while nobody is in their library', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    expect(screen.queryByTestId('library-activity')).toBeNull();
    expect(screen.queryByTestId('opponent-library-activity')).toBeNull();
  });

  it('badges your library and each opponent library in use', async () => {
    const [bob] = opponent.peers;
    renderBoard(
      defaultSettings,
      { ...view, libraryActivity: { kind: 'search' } },
      {
        ...opponent,
        peers: [
          {
            ...bob,
            view: bob.view && {
              ...bob.view,
              libraryActivity: { kind: 'look', count: 3 },
            },
          },
        ],
      }
    );
    await act(async () => {});
    const own = screen.getByTestId('library-activity');
    expect(own).toHaveAttribute('data-kind', 'search');
    expect(own).toHaveAttribute('title', 'Searching library…');
    const theirs = screen.getByTestId('opponent-library-activity');
    expect(theirs).toHaveAttribute('title', 'Looking at top 3…');
    expect(theirs).toHaveTextContent('Top 3…');
  });
});

describe('Board tools', () => {
  it('has no tool buttons in the player panel', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    [
      'Untap all',
      'Draw N…',
      'Mill N…',
      'Shuffle',
      'Token…',
      'Undo',
      'Redo',
      'Restart',
      'Add placeholder opponent',
      'Keyboard shortcuts',
    ].forEach((name) => {
      expect(screen.queryByRole('button', { name })).toBeNull();
    });
  });

  it.each([
    ['drawMany', 'Draw cards'],
    ['mill', 'Mill cards'],
    ['help', 'Keyboard shortcuts'],
    ['restart', 'Restart game?'],
  ] as const)('opens a dialog for the %s menu command', async (cmd, title) => {
    renderBoard(defaultSettings);
    await act(async () => {});
    act(() => pushMenuCommand(cmd));
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('restarts from the menu only after confirming', async () => {
    const user = userEvent.setup();
    renderBoard(defaultSettings);
    await act(async () => {});
    act(() => pushMenuCommand('restart'));
    expect(api.restartPlayTest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(api.restartPlayTest).toHaveBeenCalledTimes(1);
  });

  it('restarts from R only after confirming', async () => {
    const user = userEvent.setup();
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.keyDown(window, { key: 'r' });
    expect(api.restartPlayTest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(api.restartPlayTest).toHaveBeenCalledTimes(1);
  });

  it('asks the hand to search or look from V and Shift+V', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyDown(window, { key: 'V', shiftKey: true });
    expect(api.openHandDialog.mock.calls).toEqual([['search'], ['look']]);
  });

  it('moves the turn on from N only with turn tracking on', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.keyDown(window, { key: 'n' });
    expect(api.dispatch).not.toHaveBeenCalled();
    act(() => pushSettings({ ...defaultSettings, turnTracking: true }));
    fireEvent.keyDown(window, { key: 'n' });
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'nextTurn',
      playerId: 'p1',
      untap: true,
      draw: true,
    });
  });

  it('adds a placeholder opponent from the menu', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    act(() => pushMenuCommand('addDummy'));
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'addDummy',
      playerId: 'p1',
      name: 'Opponent 1',
    });
  });

  it('exiles the top N from the menu as one mill to exile', async () => {
    const user = userEvent.setup();
    renderBoard(defaultSettings);
    await act(async () => {});
    act(() => pushMenuCommand('exileTop'));
    const dialog = screen.getByRole('dialog', { name: 'Exile cards' });
    const input = dialog.querySelector('input')!;
    await user.clear(input);
    await user.type(input, '5{Enter}');
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'mill',
      playerId: 'p1',
      count: 5,
      to: 'exile',
    });
  });

  it('moves the whole library only after confirming', async () => {
    const user = userEvent.setup();
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put library into graveyard…' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Mill your library?' })
    ).toHaveTextContent(
      'Puts all 53 cards of your library into your graveyard'
    );
    expect(api.dispatch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Mill library' }));
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'moveAll',
      playerId: 'p1',
      from: 'library',
      to: 'graveyard',
    });

    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exile library…' }));
    await user.click(screen.getByRole('button', { name: 'Exile library' }));
    expect(api.dispatch).toHaveBeenLastCalledWith({
      type: 'moveAll',
      playerId: 'p1',
      from: 'library',
      to: 'exile',
    });
  });

  it('asks about a one-card library without a plural', async () => {
    renderBoard(defaultSettings, { ...view, libraryCount: 1 });
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exile library…' }));
    expect(
      screen.getByRole('dialog', { name: 'Exile your library?' })
    ).toHaveTextContent('Puts the only card of your library into exile');
  });

  it('offers moving permanents only when there are some', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('battlefield'));
    expect(
      screen.getByRole('menuitem', { name: 'Move permanents…' })
    ).toBeDisabled();
    act(() => pushMenuCommand('bulkMove'));
    expect(
      screen.getByRole('dialog', { name: 'Move permanents' })
    ).toBeInTheDocument();
  });

  it('reserves the turned-card overhang at the field left edge', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    const { offsetX } = fieldBounds(view.zones.battlefield);
    const field = screen.getByTestId('battlefield');
    // Drops read the reserve back off the field to undo it, so a card
    // still lands where it was aimed.
    expect(field).toHaveAttribute('data-offset-x', String(offsetX));
    expect(field.firstElementChild).toHaveStyle({
      transform: `translateX(${offsetX}px)`,
    });
  });

  it('offers undo, redo, and restart on the battlefield menu', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    const field = screen.getByTestId('battlefield');

    fireEvent.contextMenu(field);
    expect(screen.getByRole('menuitem', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Redo' })).toBeDisabled();

    act(() => pushUndoState({ canUndo: true, canRedo: true }));
    fireEvent.contextMenu(field);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo' }));
    expect(api.undo).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(field);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Redo' }));
    expect(api.redo).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(field);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restart game…' }));
    expect(
      screen.getByRole('dialog', { name: 'Restart game?' })
    ).toBeInTheDocument();
  });
});

describe('Board table panel', () => {
  it('shows the table panel and saves its placement', async () => {
    const user = userEvent.setup();
    const tablePanel = { x: 0.3, y: 0.6, collapsed: false };
    renderBoard({ ...defaultSettings, tablePanel });
    const updateSettings = vi.fn(async (patch: Partial<Settings>) => ({
      ...defaultSettings,
      ...patch,
    }));
    Object.assign(window.api, { updateSettings });
    await act(async () => {});

    const panel = screen.getByTestId('table-panel');
    expect(panel).toContainElement(screen.getByTestId('table-log'));
    await user.click(screen.getByRole('button', { name: 'Collapse Table' }));
    expect(updateSettings).toHaveBeenCalledWith({
      tablePanel: { ...tablePanel, collapsed: true },
    });
    expect(screen.queryByTestId('table-log')).toBeNull();

    act(() =>
      pushSettings({
        ...defaultSettings,
        tablePanel: { ...tablePanel, collapsed: false },
      })
    );
    expect(screen.getByTestId('table-log')).toBeInTheDocument();
  });
});

describe('Board multi-select', () => {
  const permanent = (n: number, x: number): CardView => ({
    instanceId: `p1:${n}`,
    ref: {
      id: `id-${n}`,
      name: `Bear ${n}`,
      typeLine: 'Creature — Bear',
      faces: [{ name: `Bear ${n}`, typeLine: 'Creature — Bear' }],
    },
    owner: 'p1',
    controller: 'p1',
    zone: 'battlefield',
    position: { x, y: 0 },
    tapped: false,
    faceDown: false,
    faceIndex: 0,
    counters: {},
    isToken: false,
    attachedTo: null,
  });
  const field = [permanent(1, 0), permanent(2, 200), permanent(3, 400)];
  const withField = (battlefield: CardView[], seq = 2): PublicView => ({
    ...view,
    seq,
    zones: { ...view.zones, battlefield },
  });

  // jsdom lays nothing out, so each card claims a box from its x.
  let rects: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const n = Number(this.dataset.instanceId?.split(':')[1] ?? NaN);
        const left = Number.isNaN(n) ? -1000 : (n - 1) * 200;
        return {
          left,
          right: left + 100,
          top: 0,
          bottom: 140,
          width: 100,
          height: 140,
          x: left,
          y: 0,
        } as DOMRect;
      });
    return () => rects.mockRestore();
  });

  const selected = () =>
    screen
      .queryAllByTestId('battlefield-card')
      .filter((el) => el.dataset.selected)
      .map((el) => within(el).getByTestId('card').dataset.instanceId);

  const box = (from: [number, number], to: [number, number], shift = false) => {
    const area = screen.getByTestId('battlefield');
    const at = (x: number, y: number) => ({
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
      shiftKey: shift,
    });
    fireEvent.pointerDown(area, at(...from));
    fireEvent.pointerMove(area, at(...to));
    fireEvent.pointerUp(area, at(...to));
  };

  it('selects the cards a box touches, and clears on a click or Esc', async () => {
    renderBoard(defaultSettings, withField(field));
    await act(async () => {});
    box([-50, 50], [250, 60]);
    expect(selected()).toEqual(['p1:1', 'p1:2']);
    box([350, 50], [450, 60], true);
    expect(selected()).toEqual(['p1:1', 'p1:2', 'p1:3']);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selected()).toEqual([]);

    box([-50, 50], [450, 60]);
    expect(selected()).toHaveLength(3);
    const area = screen.getByTestId('battlefield');
    fireEvent.pointerDown(area, { pointerId: 2, button: 0 });
    fireEvent.pointerUp(area, { pointerId: 2, button: 0 });
    expect(selected()).toEqual([]);
  });

  it('leaves the right-click menu and the table panel alone', async () => {
    renderBoard(defaultSettings, withField(field));
    await act(async () => {});
    box([-50, 50], [450, 60]);
    const area = screen.getByTestId('battlefield');
    fireEvent.pointerDown(area, { pointerId: 3, button: 2 });
    fireEvent.pointerUp(area, { pointerId: 3, button: 2 });
    fireEvent.contextMenu(area);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Dismissing the menu by clicking the field keeps the selection.
    fireEvent.pointerDown(area, { pointerId: 4, button: 0 });
    fireEvent.pointerUp(area, { pointerId: 4, button: 0 });
    expect(selected()).toHaveLength(3);
    fireEvent.click(document.body);

    const panel = screen.getByTestId('table-panel');
    fireEvent.pointerDown(panel, { pointerId: 5, button: 0 });
    fireEvent.pointerUp(panel, { pointerId: 5, button: 0 });
    expect(selected()).toHaveLength(3);
  });

  it('keeps the selection through peer updates, pruning cards that leave', async () => {
    const own = pushable(withField(field));
    const peers = pushable(opponent);
    renderBoard(defaultSettings, own.store, peers.store);
    await act(async () => {});
    box([-50, 50], [450, 60]);
    expect(selected()).toHaveLength(3);

    peers.push({ ...opponent, seq: 2, log: [] });
    expect(selected()).toHaveLength(3);

    // Gone to the graveyard, or handed to another player.
    own.push(withField([field[0], field[2]], 3));
    expect(selected()).toEqual(['p1:1', 'p1:3']);
    // Coming back doesn't select it again.
    own.push(withField(field, 4));
    expect(selected()).toEqual(['p1:1', 'p1:3']);

    // A new game starts with an empty battlefield.
    own.push(withField([], 5));
    own.push(withField(field, 6));
    expect(selected()).toEqual([]);
  });

  it('clears when a game starts, even with permanents already out', async () => {
    renderBoard(defaultSettings, withField(field));
    await act(async () => {});
    box([-50, 50], [450, 60]);
    expect(selected()).toHaveLength(3);
    act(() => pushGameStarted());
    expect(selected()).toEqual([]);
  });

  it('leaves an Escape something else took, and ends on lost capture', async () => {
    renderBoard(defaultSettings, withField(field));
    await act(async () => {});
    box([-50, 50], [450, 60]);
    const taken = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener('keydown', taken, true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', taken, true);
    expect(selected()).toHaveLength(3);

    const area = screen.getByTestId('battlefield');
    fireEvent.pointerDown(area, { pointerId: 7, button: 0, clientX: -50 });
    fireEvent.pointerMove(area, { pointerId: 7, clientX: 50, clientY: 60 });
    expect(screen.getByTestId('selection-box')).toBeInTheDocument();
    fireEvent(
      area,
      Object.assign(new Event('lostpointercapture', { bubbles: true }), {
        pointerId: 7,
      })
    );
    expect(screen.queryByTestId('selection-box')).toBeNull();
    expect(selected()).toEqual(['p1:1']);
  });
});

describe('Board top of the library', () => {
  const ref = (name: string) => ({
    id: `id-${name}`,
    name,
    typeLine: 'Creature — Bear',
    faces: [{ name, typeLine: 'Creature — Bear' }],
  });

  it('offers reveal-until and both top card toggles', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    expect(screen.queryByTestId('library-top-card')).toBeNull();
    const choose = (name: string) => {
      fireEvent.contextMenu(screen.getByTestId('library'));
      fireEvent.click(screen.getByRole('menuitem', { name }));
    };
    choose('Reveal until…');
    expect(api.openHandDialog).toHaveBeenCalledWith('revealUntil');
    choose('Play with the top card revealed');
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'setTopRevealed',
      playerId: 'p1',
      revealed: true,
    });
    choose('Always look at the top card');
    expect(api.setLookAtTop).toHaveBeenCalledWith(true);
  });

  it('shows a revealed top card on your library and theirs', async () => {
    const theirs: OpponentState = {
      ...opponent,
      peers: opponent.peers.map((peer) => ({
        ...peer,
        view: peer.view && { ...peer.view, topCard: ref('Their Bear') },
      })),
    };
    renderBoard(defaultSettings, { ...view, topCard: ref('My Bear') }, theirs);
    await act(async () => {});
    expect(
      within(screen.getByTestId('library-top-card')).getByTestId('card')
    ).toHaveAttribute('data-card-name', 'My Bear');
    expect(
      within(screen.getByTestId('opponent-library-top-card')).getByTestId(
        'card'
      )
    ).toHaveAttribute('data-card-name', 'Their Bear');
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Stop playing with the top card revealed',
      })
    );
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'setTopRevealed',
      playerId: 'p1',
      revealed: false,
    });
  });
});

describe('Board reveals to one player', () => {
  afterEach(() => {
    revealTargets = [];
  });

  it('badges whoever is showing whom, and never the cards', async () => {
    renderBoard(
      defaultSettings,
      {
        ...view,
        name: 'Alice',
        showing: { to: 'p2', source: 'hand', count: 2 },
      },
      {
        ...opponent,
        peers: [
          {
            ...opponent.peers[0],
            view: {
              ...view,
              playerId: 'p2',
              name: 'Bob',
              showing: { to: 'p1', source: 'card', count: 1 },
            },
          },
        ],
      }
    );
    await act(async () => {});
    expect(screen.getByTestId('showing-badge')).toHaveTextContent(
      'Alice is showing Bob 2 cards'
    );
    expect(screen.getByTestId('opponent-showing-badge')).toHaveTextContent(
      'Bob is showing you 1 card'
    );
  });

  it('shows the top cards to one player from the library menu', async () => {
    revealTargets = [{ playerId: 'p2', name: 'Bob', ready: true }];
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal the top card to Bob' })
    );
    expect(api.revealTo).toHaveBeenCalledWith(
      { to: 'p2', source: 'libraryTop', count: 1 },
      undefined
    );

    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal the top N…' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Reveal cards' });
    fireEvent.change(within(dialog).getByRole('spinbutton'), {
      target: { value: '3' },
    });
    fireEvent.change(within(dialog).getByLabelText('Reveal to'), {
      target: { value: 'p2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(api.revealTo).toHaveBeenLastCalledWith(
      { to: 'p2', source: 'libraryTop', count: 3 },
      undefined
    );
    expect(api.dispatch).not.toHaveBeenCalled();
  });

  it('keeps a departed player chosen for the top N, and waits', async () => {
    revealTargets = [{ playerId: 'p2', name: 'Bob', ready: true }];
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal the top N…' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Reveal cards' });
    fireEvent.change(within(dialog).getByLabelText('Reveal to'), {
      target: { value: 'p2' },
    });
    act(() => pushRevealTargets([]));
    expect(
      (within(dialog).getByLabelText('Reveal to') as HTMLSelectElement).value
    ).toBe('p2');
    expect(
      within(dialog).getByTestId('reveal-target-unavailable')
    ).toHaveTextContent('Bob can’t be shown cards now (left the table)');
    const ok = within(dialog).getByRole('button', { name: 'OK' });
    expect(ok).toBeDisabled();
    fireEvent.click(ok);
    expect(api.revealTo).not.toHaveBeenCalled();
    expect(api.dispatch).not.toHaveBeenCalled();
  });

  it('reveals the top N to everyone outside a pod', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    fireEvent.contextMenu(screen.getByTestId('library'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal the top N…' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Reveal cards' });
    expect(within(dialog).queryByLabelText('Reveal to')).toBeNull();
    fireEvent.change(within(dialog).getByRole('spinbutton'), {
      target: { value: '2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(api.dispatch).toHaveBeenCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'libraryTop',
      count: 2,
    });
  });
});
