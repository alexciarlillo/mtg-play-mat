import type { PublicView } from '@shared/game';
import type { OpponentState } from '@shared/net/remoteViews';
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
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
let pushUndoState: (next: { canUndo: boolean; canRedo: boolean }) => void;
let api: Record<string, ReturnType<typeof vi.fn>>;

const renderBoard = (
  initial: Settings,
  own: PublicView = view,
  others: OpponentState = opponent
) => {
  api = {
    dispatch: vi.fn(async () => {}),
    undo: vi.fn(async () => {}),
    redo: vi.fn(async () => {}),
    restartPlayTest: vi.fn(async () => {}),
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
      onBoardMenuCommand: (listener: typeof pushMenuCommand) => {
        pushMenuCommand = listener;
        return () => {};
      },
    },
  });
  render(
    <ContextMenuProvider>
      <Board store={storeOf(own)} opponent={storeOf(others)} />
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
  it('has no tool buttons in the side panel', async () => {
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
