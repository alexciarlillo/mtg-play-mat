import type { CardView, PrivateView } from '@shared/game';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  attachedTo: null,
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

const libraryCard = (n: number, name: string, typeLine: string) => ({
  ...handCard(n),
  ref: { id: `id-${n}`, name, typeLine, faces: [{ name, typeLine }] },
  zone: 'library' as const,
});

const library: CardView[] = [
  libraryCard(20, 'Grizzly Bears', 'Creature — Bear'),
  libraryCard(21, 'Forest', 'Basic Land — Forest'),
  libraryCard(22, 'Giant Growth', 'Instant'),
  libraryCard(23, 'Island', 'Basic Land — Island'),
];
const getLibrary = vi.fn(() => Promise.resolve(library));
const setLibraryActivity = vi.fn(() => Promise.resolve());
let pushGameStarted: () => void;

beforeEach(() => {
  Object.assign(window, {
    api: {
      dispatch,
      getLibrary,
      setLibraryActivity,
      onGameStarted: (listener: () => void) => {
        pushGameStarted = listener;
        return () => {};
      },
      onUndoState: () => () => {},
      getUndoState: () => new Promise(() => {}),
    },
  });
});

afterEach(() => {
  dispatch.mockClear();
  getLibrary.mockClear();
  setLibraryActivity.mockClear();
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

  it('plays a card face down, or a modal DFC as its back face', () => {
    const mdfc: CardView = {
      ...handCard(0),
      ref: {
        id: 'ea7e4c65-b4c4-4795-9475-3cba71c50ea5',
        name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
        typeLine: 'Legendary Creature — God // Legendary Planeswalker',
        layout: 'modal_dfc',
        faces: [
          { name: 'Valki, God of Lies', typeLine: 'Legendary Creature — God' },
          {
            name: 'Tibalt, Cosmic Impostor',
            typeLine: 'Legendary Planeswalker — Tibalt',
          },
        ],
      },
    };
    renderHand(viewOf({ keptHand: true, hand: [mdfc] }));
    const open = () => fireEvent.contextMenu(screen.getByTestId('card'));

    open();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Play as Tibalt, Cosmic Impostor' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:0',
      to: 'battlefield',
      faceIndex: 1,
    });
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Play face down' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:0',
      to: 'battlefield',
      faceDown: true,
    });
  });

  it('lets the owner peek at their face-down permanents', () => {
    const hidden: CardView = {
      ...handCard(9),
      zone: 'battlefield',
      position: { x: 0, y: 0 },
      faceDown: true,
    };
    renderHand(
      viewOf({
        keptHand: true,
        zones: { battlefield: [hidden], graveyard: [], exile: [], command: [] },
      })
    );
    const peek = screen.getByTestId('face-down-peek');
    expect(peek.querySelector('[data-instance-id="p1:9"]')).toHaveAttribute(
      'data-card-name',
      'Card 9'
    );
    expect(screen.getByAltText('Card 9')).toBeInTheDocument();
  });

  it('reveals one card or the whole hand, and hides it again', () => {
    const { rerender } = renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'card',
      instanceId: 'p1:2',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal hand' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'hand',
    });

    const shown = viewOf({
      keptHand: true,
      revealed: { source: 'hand', cards: viewOf().hand.map((c) => c.ref!) },
    });
    rerender(
      <ContextMenuProvider>
        <Hand store={storeOf(shown)} />
      </ContextMenuProvider>
    );
    expect(screen.getByTestId('hand-reveal-banner')).toHaveTextContent(
      'Everyone can see your hand (7)'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'hideReveal',
      playerId: 'p1',
    });
  });

  it('looks at the top cards and applies the arrangement at once', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Look at top…' }));
    fireEvent.change(screen.getByLabelText('How many cards?'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    const look = await screen.findAllByTestId('look-card');
    expect(setLibraryActivity).toHaveBeenCalledWith({ kind: 'look', count: 3 });
    expect(look.map((el) => el.dataset.cardName)).toEqual([
      'Grizzly Bears',
      'Forest',
      'Giant Growth',
    ]);
    fireEvent.click(
      within(look[0]).getByRole('button', { name: 'Move right' })
    );
    fireEvent.change(within(look[2]).getByLabelText('Destination'), {
      target: { value: 'bottom' },
    });
    fireEvent.change(
      within(screen.getAllByTestId('look-card')[0]).getByLabelText(
        'Destination'
      ),
      { target: { value: 'graveyard' } }
    );
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'arrangeTop',
      playerId: 'p1',
      top: ['p1:20'],
      bottom: ['p1:22'],
      graveyard: ['p1:21'],
      hand: [],
    });
    expect(screen.queryByTestId('look-at-top')).not.toBeInTheDocument();
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });

  it('tells the table only while a library dialog is open', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Look at top…' }));
    // Choosing how many isn't looking yet.
    expect(setLibraryActivity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setLibraryActivity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    await screen.findAllByTestId('search-card');
    expect(setLibraryActivity.mock.calls).toEqual([[{ kind: 'search' }]]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(setLibraryActivity.mock.calls).toEqual([
      [{ kind: 'search' }],
      [null],
    ]);
  });

  it('closes library dialogs when a new game starts', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    await screen.findAllByTestId('search-card');
    act(() => pushGameStarted());
    expect(screen.queryByTestId('library-search')).toBeNull();
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });

  it('searches by name or type, then moves and shuffles', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    expect(await screen.findAllByTestId('search-card')).toHaveLength(4);

    fireEvent.change(screen.getByLabelText('Filter by name or type'), {
      target: { value: 'land isl' },
    });
    const [island] = screen.getAllByTestId('search-card');
    expect(screen.getAllByTestId('search-card')).toHaveLength(1);
    fireEvent.click(within(island).getByTestId('card'));
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'battlefield' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move 1 and shuffle' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'searchLibrary',
      playerId: 'p1',
      instanceIds: ['p1:23'],
      to: 'battlefield',
      shuffle: true,
    });
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });
});
