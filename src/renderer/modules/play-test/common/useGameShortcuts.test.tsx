import type { CardView, PublicView } from '@shared/game';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Card from '../../../ui/Card';
import { CardPreviewProvider } from '../../../ui/CardPreview';
import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import type { HoverKeyHandler } from '../../../ui/hoverKeys';
import { useGameShortcuts } from './useGameShortcuts';

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
};

const dispatch = vi.fn((_action: unknown) => Promise.resolve());
const undo = vi.fn(() => Promise.resolve());
const redo = vi.fn(() => Promise.resolve());
const onHelp = vi.fn();
const onRestart = vi.fn();
const onLibraryDialog = vi.fn();
const netRoll = vi.fn((_request: unknown) => Promise.resolve());

interface HarnessProps {
  enabled?: boolean;
  turnTracking?: boolean;
  libraryCount?: number;
}

const Harness = ({
  enabled = true,
  turnTracking = false,
  libraryCount = 53,
}: HarnessProps) => {
  useGameShortcuts(
    { ...view, libraryCount },
    { enabled, onHelp, onRestart, onLibraryDialog, turnTracking }
  );
  return (
    <>
      <input aria-label="text" />
      <input aria-label="slider" type="range" />
    </>
  );
};

const card: CardView = {
  instanceId: 'p1:7',
  ref: null,
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: null,
  tapped: false,
  faceDown: true,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

const Hovered = ({ onHoverKey }: { onHoverKey?: HoverKeyHandler }) => (
  <ContextMenuProvider>
    <CardPreviewProvider>
      <Harness />
      <Card card={card} onHoverKey={onHoverKey} />
    </CardPreviewProvider>
  </ContextMenuProvider>
);

beforeEach(() => {
  Object.assign(window, { api: { dispatch, undo, redo, netRoll } });
});

afterEach(() => {
  dispatch.mockClear();
  undo.mockClear();
  redo.mockClear();
  onHelp.mockClear();
  onRestart.mockClear();
  onLibraryDialog.mockClear();
  netRoll.mockClear();
  localStorage.clear();
});

const actions = () => dispatch.mock.calls.map(([action]) => action);

describe('useGameShortcuts', () => {
  it('maps D, U, and S to actions', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'U' });
    fireEvent.keyDown(window, { key: 's' });
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'draw', playerId: 'p1', count: 1 },
      { type: 'untapAll', playerId: 'p1' },
      { type: 'shuffle', playerId: 'p1' },
    ]);
  });

  it('rolls with 1 to 4, not while typing or held', () => {
    render(<Harness />);
    ['1', '2', '3', '4'].forEach((key) => fireEvent.keyDown(window, { key }));
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: '2', repeat: true });
    fireEvent.keyDown(window, { key: '!', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('text'), { key: '1' });
    expect(netRoll.mock.calls.map(([request]) => request)).toEqual([
      { type: 'coin' },
      { type: 'die', sides: 6 },
      { type: 'dice', count: 2, sides: 6 },
      { type: 'die', sides: 20 },
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves modified keys alone so reload still works', () => {
    const onHoverKey = vi.fn();
    render(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      for (const key of ['r', 'd', 'v', 'c', 'x', 'l']) {
        fireEvent.keyDown(window, { key, [mod]: true });
      }
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
    expect(onLibraryDialog).not.toHaveBeenCalled();
    expect(onHoverKey).not.toHaveBeenCalled();
  });

  it('keeps Shift for V and L only', () => {
    const onHoverKey = vi.fn();
    render(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    for (const key of ['D', 'U', 'S', 'R', 'N', 'T', 'G', 'X']) {
      fireEvent.keyDown(window, { key, shiftKey: true });
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
    expect(onHoverKey).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'L', shiftKey: true });
    fireEvent.keyDown(window, { key: 'V', shiftKey: true });
    expect(onHoverKey.mock.calls).toEqual([['L']]);
    expect(onLibraryDialog.mock.calls).toEqual([['look']]);
  });

  it('reads letters by position on a non-Latin layout', () => {
    const onHoverKey = vi.fn();
    render(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.keyDown(window, { key: 'в', code: 'KeyD' });
    expect(actions()).toEqual([{ type: 'draw', playerId: 'p1', count: 1 }]);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    fireEvent.keyDown(window, { key: 'е', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'Д', code: 'KeyL', shiftKey: true });
    expect(onHoverKey.mock.calls).toEqual([['t'], ['L']]);
  });

  it('ignores typing and disabled windows but still toggles help', () => {
    const { getByLabelText, rerender } = render(<Harness />);
    fireEvent.keyDown(getByLabelText('text'), { key: 'd' });
    expect(dispatch).not.toHaveBeenCalled();

    rerender(<Harness enabled={false} />);
    fireEvent.keyDown(window, { key: 'd' });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '?' });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('undoes with Cmd/Ctrl+Z and redoes with Shift', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'z', metaKey: true, altKey: true });
    fireEvent.keyDown(window, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(2);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves undo to text fields and disabled windows', () => {
    const { getByLabelText, rerender } = render(<Harness />);
    const typed = fireEvent.keyDown(getByLabelText('text'), {
      key: 'z',
      metaKey: true,
    });
    // Not prevented, so the field's own undo still runs.
    expect(typed).toBe(true);
    rerender(<Harness enabled={false} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('moves the turn on with N only while turns are tracked', () => {
    localStorage.setItem(
      'play-test.nextTurn',
      JSON.stringify({ untap: false, draw: true })
    );
    const { rerender } = render(<Harness />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(dispatch).not.toHaveBeenCalled();
    rerender(<Harness turnTracking />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(actions()).toEqual([
      { type: 'nextTurn', playerId: 'p1', untap: false, draw: true },
    ]);
  });

  it('opens library dialogs with V and Shift+V, and asks to restart', () => {
    const { rerender } = render(<Harness />);
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyDown(window, { key: 'V', shiftKey: true });
    fireEvent.keyDown(window, { key: 'r' });
    expect(onLibraryDialog.mock.calls).toEqual([['search'], ['look']]);
    expect(onRestart).toHaveBeenCalledTimes(1);
    rerender(<Harness libraryCount={0} />);
    fireEvent.keyDown(window, { key: 'V', shiftKey: true });
    expect(onLibraryDialog).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('adjusts life with the arrows and +/-, held or not', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true });
    fireEvent.keyDown(window, { key: '+', shiftKey: true });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: '-' });
    expect(actions().map((a) => (a as { delta: number }).delta)).toEqual([
      1, 1, 1, -1, -1,
    ]);
  });

  it('leaves arrows to a focused control', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByLabelText('slider'), { key: 'ArrowUp' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('holds game keys while any dialog or menu is open', () => {
    render(
      <>
        <Harness />
        <div role="menu" />
      </>
    );
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(dispatch).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('hands hover keys to the card under the pointer', () => {
    const onHoverKey = vi.fn();
    render(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.keyDown(window, { key: 't' });
    expect(onHoverKey).not.toHaveBeenCalled();

    const face = screen.getByTestId('card');
    fireEvent.mouseEnter(face);
    fireEvent.keyDown(window, { key: 't' });
    fireEvent.keyDown(window, { key: 'L', shiftKey: true });
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'g', repeat: true });
    expect(onHoverKey.mock.calls).toEqual([['t'], ['L'], ['l']]);

    fireEvent.mouseLeave(face);
    fireEvent.keyDown(window, { key: 't' });
    expect(onHoverKey).toHaveBeenCalledTimes(3);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ignores hover keys over a card that takes none, or while typing', () => {
    const { rerender } = render(<Hovered />);
    const face = screen.getByTestId('card');
    fireEvent.mouseEnter(face);
    fireEvent.keyDown(window, { key: 'g' });
    const onHoverKey = vi.fn();
    rerender(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.mouseLeave(face);
    fireEvent.mouseEnter(face);
    fireEvent.keyDown(screen.getByLabelText('text'), { key: 'g' });
    expect(onHoverKey).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'g' });
    expect(onHoverKey).toHaveBeenCalledWith('g');
  });
});

describe('R over a card', () => {
  it('goes to a card that takes it, and restarts otherwise', () => {
    const takes = vi.fn(() => true);
    const { unmount } = render(<Hovered onHoverKey={takes} />);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    fireEvent.keyDown(window, { key: 'r' });
    expect(takes).toHaveBeenCalledWith('r');
    expect(onRestart).not.toHaveBeenCalled();
    unmount();

    // A permanent gives R back, so it still restarts the game.
    const declines = vi.fn(() => false);
    render(<Hovered onHoverKey={declines} />);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    fireEvent.keyDown(window, { key: 'r' });
    expect(declines).toHaveBeenCalledWith('r');
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('never reaches a card through the plain hover key path', () => {
    const onHoverKey = vi.fn();
    render(<Hovered onHoverKey={onHoverKey} />);
    fireEvent.mouseEnter(screen.getByTestId('card'));
    fireEvent.keyDown(window, { key: 'R', shiftKey: true });
    expect(onHoverKey).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });
});
