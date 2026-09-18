import type { CardView, PrivateView } from '@shared/game';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import type { ViewStore } from '../viewStore';
import Hand from './Hand';

const handCard = (n: number): CardView => ({
  instanceId: `p1:${n}`,
  ref: {
    id: `id-${n}`,
    name: `Card ${n}`,
    typeLine: 'Creature',
    faces: [{ name: `Card ${n}`, typeLine: 'Creature' }],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'hand',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
});

const viewOf = (patch: Partial<PrivateView> = {}): PrivateView => ({
  seq: 1,
  playerId: 'p1',
  name: 'You',
  life: 20,
  counters: {},
  mulligans: 0,
  keptHand: false,
  zones: { battlefield: [], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
  hand: Array.from({ length: 7 }, (_, i) => handCard(i)),
  ...patch,
});

const storeOf = (view: PrivateView): ViewStore<PrivateView> => ({
  subscribe: () => () => {},
  getSnapshot: () => view,
});

const dispatch = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => {
  dispatch.mockClear();
});

const renderHand = (view: PrivateView) =>
  render(
    <ContextMenuProvider>
      <Hand store={storeOf(view)} />
    </ContextMenuProvider>
  );

const cards = () => screen.getAllByTestId('card');

describe('Hand', () => {
  it('keeps a hand straight away with no mulligans', () => {
    renderHand(viewOf());
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'keepHand',
      playerId: 'p1',
      bottom: [],
    });
  });

  it('mulligans from the bar and the M key', () => {
    renderHand(viewOf());
    fireEvent.click(screen.getByRole('button', { name: 'Mulligan' }));
    fireEvent.keyDown(window, { key: 'm' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'mulligan',
      playerId: 'p1',
    });
  });

  it('picks one card per mulligan to bottom on keep', () => {
    renderHand(viewOf({ mulligans: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    const confirm = screen.getByRole('button', { name: 'Bottom and keep' });
    expect(confirm).toBeDisabled();

    // Picking plays nothing, and a third pick is ignored.
    fireEvent.click(cards()[4]);
    fireEvent.click(cards()[1]);
    fireEvent.click(cards()[2]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText(/\(2\/2\)/)).toBeInTheDocument();

    fireEvent.click(confirm);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'keepHand',
      playerId: 'p1',
      bottom: ['p1:4', 'p1:1'],
    });
  });

  it('plays on click and discards from the menu once kept', () => {
    renderHand(viewOf({ keptHand: true }));
    expect(screen.queryByTestId('mulligan-bar')).not.toBeInTheDocument();

    fireEvent.click(cards()[0]);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:0',
      to: 'battlefield',
    });

    fireEvent.contextMenu(cards()[3]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Discard' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:3',
      to: 'graveyard',
    });

    // M does nothing once the hand is kept.
    dispatch.mockClear();
    fireEvent.keyDown(window, { key: 'm' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
