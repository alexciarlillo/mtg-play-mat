import type { PublicView } from '@shared/game';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const onHelp = vi.fn();

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  useGameShortcuts(view, { enabled, onHelp });
  return <input aria-label="text" />;
};

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => {
  dispatch.mockClear();
  onHelp.mockClear();
});

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

  it('leaves modified keys alone so reload still works', () => {
    render(<Harness />);
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
      fireEvent.keyDown(window, { key: 'r', [mod]: true });
      fireEvent.keyDown(window, { key: 'd', [mod]: true });
    }
    expect(dispatch).not.toHaveBeenCalled();
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
});
