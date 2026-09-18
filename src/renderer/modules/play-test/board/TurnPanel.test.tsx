import type { PublicView } from '@shared/game';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import RevealPanel from './RevealPanel';
import TurnPanel from './TurnPanel';

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
  turn: 4,
  phase: 'combat',
};

const dispatch = vi.fn((_action: unknown) => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
  localStorage.clear();
});

afterEach(() => {
  dispatch.mockClear();
});

describe('TurnPanel', () => {
  it('shows the turn and phase and moves to a clicked phase', () => {
    render(<TurnPanel view={view} />);
    expect(screen.getByTestId('turn')).toHaveTextContent('4');
    expect(screen.getByTestId('phase-combat')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByTestId('phase-end'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setPhase',
      playerId: 'p1',
      phase: 'end',
    });
  });

  it('starts the next turn with the chosen steps, remembered', () => {
    const { unmount } = render(<TurnPanel view={view} />);
    const next = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    next();
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'nextTurn',
      playerId: 'p1',
      untap: true,
      draw: true,
    });

    fireEvent.click(screen.getByLabelText('draw 1'));
    unmount();
    render(<TurnPanel view={view} />);
    expect(screen.getByLabelText('draw 1')).not.toBeChecked();
    next();
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'nextTurn',
      playerId: 'p1',
      untap: true,
      draw: false,
    });
  });
});

describe('RevealPanel', () => {
  const ref = {
    id: 'id-1',
    name: 'Shown Card',
    typeLine: 'Instant',
    faces: [{ name: 'Shown Card', typeLine: 'Instant' }],
  };

  it('renders nothing without a reveal', () => {
    render(<RevealPanel reveal={null} />);
    expect(screen.queryByTestId('reveal-panel')).not.toBeInTheDocument();
  });

  it('shows the revealed cards, with Hide only for their owner', () => {
    const onHide = vi.fn();
    const { rerender } = render(
      <RevealPanel reveal={{ source: 'card', cards: [ref] }} onHide={onHide} />,
      { wrapper: ContextMenuProvider }
    );
    expect(screen.getByTestId('reveal-panel')).toHaveTextContent(
      'Revealed from hand (1)'
    );
    expect(screen.getByTestId('card')).toHaveAttribute(
      'data-card-name',
      'Shown Card'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onHide).toHaveBeenCalled();

    rerender(
      <RevealPanel
        reveal={{ source: 'hand', cards: [ref] }}
        testId="opponent-reveal-panel"
      />
    );
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });
});
