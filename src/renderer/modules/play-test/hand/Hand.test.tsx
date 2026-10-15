import type {
  CardRef,
  CardView,
  PrivateLogEntry,
  PrivateView,
  SeenEntry,
  ShownToYou,
} from '@shared/game';
import type { RevealTarget } from '@shared/net/revealTargets';
import { defaultSettings } from '@shared/settings';
import type { HandCommand } from '@shared/types/playTest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardPreviewProvider } from '../../../ui/CardPreview';
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
// Island (id-23) has no facts, like a printing the database doesn't know.
const getCardFacts = vi.fn(() =>
  Promise.resolve({
    'id-20': {
      mv: 2,
      colors: ['G'],
      colorIdentity: ['G'],
      keywords: [],
      faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
    },
    'id-21': {
      mv: 0,
      colors: [],
      colorIdentity: ['G'],
      keywords: [],
      faces: [
        {
          name: 'Forest',
          typeLine: 'Basic Land — Forest',
          oracleText: '({T}: Add {G}.)',
        },
      ],
    },
    'id-22': {
      mv: 1,
      colors: ['G'],
      colorIdentity: ['G'],
      keywords: [],
      faces: [
        {
          name: 'Giant Growth',
          typeLine: 'Instant',
          oracleText: 'Target creature gets +3/+3 until end of turn.',
        },
      ],
    },
  })
);
const setLibraryActivity = vi.fn(() => Promise.resolve());
let pushGameStarted: () => void;
let pushHandCommand: (command: HandCommand) => void;
let pushLookAtTop: (on: boolean) => void;
const getLookAtTop = vi.fn(() => Promise.resolve(false));
let revealTargets: RevealTarget[] = [];
let pushRevealTargets: (targets: RevealTarget[]) => void;
let pushShownToYou: (entries: ShownToYou[]) => void;
let pushPrivateLog: (entries: PrivateLogEntry[]) => void;
let pushSeenByYou: (entries: SeenEntry[]) => void;
const revealTo = vi.fn(() => Promise.resolve());
const stopShowing = vi.fn(() => Promise.resolve());
const dismissShown = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, {
    api: {
      dispatch,
      getLibrary,
      getCardFacts,
      setLibraryActivity,
      getSettings: () => Promise.resolve(defaultSettings),
      updateSettings: (patch: object) =>
        Promise.resolve({ ...defaultSettings, ...patch }),
      onSettingsChanged: () => () => {},
      onGameStarted: (listener: () => void) => {
        pushGameStarted = listener;
        return () => {};
      },
      onHandCommand: (listener: typeof pushHandCommand) => {
        pushHandCommand = listener;
        return () => {};
      },
      onUndoState: () => () => {},
      getUndoState: () => new Promise(() => {}),
      getLookAtTop,
      onLookAtTop: (listener: typeof pushLookAtTop) => {
        pushLookAtTop = listener;
        return () => {};
      },
      getRevealTargets: () => Promise.resolve(revealTargets),
      onRevealTargets: (listener: typeof pushRevealTargets) => {
        pushRevealTargets = listener;
        return () => {};
      },
      getShownToYou: () => Promise.resolve([]),
      onShownToYou: (listener: typeof pushShownToYou) => {
        pushShownToYou = listener;
        return () => {};
      },
      getPrivateLog: () => Promise.resolve([]),
      getSeenByYou: () => Promise.resolve([]),
      onSeenByYou: (listener: typeof pushSeenByYou) => {
        pushSeenByYou = listener;
        return () => {};
      },
      onPrivateLog: (listener: typeof pushPrivateLog) => {
        pushPrivateLog = listener;
        return () => {};
      },
      revealTo,
      stopShowing,
      dismissShown,
    },
  });
});

afterEach(() => {
  revealTargets = [];
  revealTo.mockClear();
  stopShowing.mockClear();
  dismissShown.mockClear();
  dispatch.mockClear();
  getLibrary.mockClear();
  setLibraryActivity.mockClear();
});

const renderHand = (view: PrivateView) =>
  render(
    <ContextMenuProvider>
      <CardPreviewProvider>
        <Hand store={storeOf(view)} />
      </CardPreviewProvider>
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

  it('keeps the mulligan controls inside the title bar', () => {
    renderHand(viewOf());
    expect(screen.getByTestId('hand-title')).toContainElement(
      screen.getByTestId('mulligan-bar')
    );
  });

  it('keeps the reveal banner inside the title bar', () => {
    renderHand(
      viewOf({
        keptHand: true,
        revealed: { source: 'hand', cards: viewOf().hand.map((c) => c.ref!) },
      })
    );
    expect(screen.getByTestId('hand-title')).toContainElement(
      screen.getByTestId('hand-reveal-banner')
    );
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

  it('plays a card tapped', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Play tapped' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:2',
      to: 'battlefield',
      tapped: true,
    });
  });

  it('puts a card 3rd from the top, or the bottom past the end', () => {
    renderHand(viewOf({ keptHand: true, libraryCount: 5 }));
    const putAt = (n: number, position: string) => {
      fireEvent.contextMenu(cards()[n]);
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Put Xth from top…' })
      );
      const input = screen.getByLabelText(/Position from the top/);
      expect(input).toHaveValue(3);
      fireEvent.change(input, { target: { value: position } });
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    };
    putAt(1, '3');
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:1',
      to: 'library',
      index: 2,
    });
    putAt(4, '40');
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:4',
      to: 'library',
      index: 5,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts cards back on top in the order clicked, as one action', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[5]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on top…' })
    );
    const bar = screen.getByTestId('put-back-bar');
    expect(bar).toHaveTextContent('1 ends up on top');

    // Clicking picks instead of playing; a second click unpicks.
    fireEvent.click(cards()[2]);
    fireEvent.click(cards()[0]);
    fireEvent.click(cards()[0]);
    fireEvent.click(cards()[0]);
    expect(dispatch).not.toHaveBeenCalled();
    // Badges read in hand order: cards 0, 2 and 5.
    expect(
      screen.getAllByTestId('pick-number').map((n) => n.textContent)
    ).toEqual(['3', '2', '1']);

    fireEvent.click(screen.getByRole('button', { name: 'Put 3 on top' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'putFromHand',
      playerId: 'p1',
      top: ['p1:5', 'p1:2', 'p1:0'],
      bottom: [],
    });
    expect(screen.queryByTestId('put-back-bar')).not.toBeInTheDocument();
  });

  it('puts cards on the bottom, or cancels with Escape', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[1]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on the bottom…' })
    );
    expect(screen.getByTestId('put-back-bar')).toHaveTextContent(
      'the last ends up at the very bottom'
    );
    fireEvent.click(cards()[3]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Put 2 on the bottom' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'putFromHand',
      playerId: 'p1',
      top: [],
      bottom: ['p1:1', 'p1:3'],
    });

    dispatch.mockClear();
    fireEvent.contextMenu(cards()[1]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on top…' })
    );
    // Taken, so a docked board's Escape leaves its selection alone.
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false);
    expect(screen.queryByTestId('put-back-bar')).not.toBeInTheDocument();
    fireEvent.click(cards()[1]);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:1',
      to: 'battlefield',
    });
  });

  it('offers putting back only once the hand is kept', () => {
    let view = viewOf({ keptHand: true });
    const listeners = new Set<() => void>();
    const store: ViewStore<PrivateView> = {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => view,
    };
    render(
      <ContextMenuProvider>
        <Hand store={store} />
      </ContextMenuProvider>
    );
    fireEvent.contextMenu(cards()[0]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on top…' })
    );
    expect(screen.getByTestId('put-back-bar')).toBeInTheDocument();

    // An undone keep brings the mulligan back and ends the put-back.
    act(() => {
      view = viewOf({ keptHand: false });
      listeners.forEach((listener) => listener());
    });
    expect(screen.queryByTestId('put-back-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('mulligan-bar')).toBeInTheDocument();
    expect(screen.queryAllByTestId('pick-number')).toHaveLength(0);
    fireEvent.contextMenu(cards()[0]);
    expect(
      screen.queryByRole('menuitem', { name: 'Put cards on top…' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Put cards on the bottom…' })
    ).not.toBeInTheDocument();
  });

  it('leaves Escape to a dialog open elsewhere, and forgets picks on a new game', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[0]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on top…' })
    );
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.append(other);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('put-back-bar')).toBeInTheDocument();
    other.remove();

    act(() => pushGameStarted());
    expect(screen.queryByTestId('put-back-bar')).not.toBeInTheDocument();
    fireEvent.contextMenu(cards()[2]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put cards on top…' })
    );
    // Only the newly right-clicked card is picked.
    expect(screen.getAllByTestId('pick-number')).toHaveLength(1);
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
        <CardPreviewProvider>
          <Hand store={storeOf(shown)} />
        </CardPreviewProvider>
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

  const openLook = async (
    count: string,
    preset?: string,
    take?: string
  ): Promise<HTMLElement[]> => {
    fireEvent.click(screen.getByRole('button', { name: 'Look at top…' }));
    if (preset) {
      fireEvent.change(screen.getByLabelText('Effect'), {
        target: { value: preset },
      });
    }
    fireEvent.change(screen.getByLabelText('How many cards?'), {
      target: { value: count },
    });
    if (take) {
      fireEvent.change(screen.getByLabelText('How many into your hand?'), {
        target: { value: take },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    return screen.findAllByTestId('look-card');
  };

  const press = (key: string, shiftKey = false) =>
    fireEvent.keyDown(window, { key, shiftKey });

  const lanesOf = () =>
    screen
      .getAllByTestId('look-card')
      .map((el) => `${el.dataset.cardName}:${el.dataset.dest}`);

  const arranged = (lists: Record<string, string[]>, extra = {}) => ({
    type: 'arrangeTop',
    playerId: 'p1',
    top: [],
    bottom: [],
    graveyard: [],
    exile: [],
    hand: [],
    ...lists,
    ...extra,
  });

  it('looks at the top cards and applies the arrangement at once', async () => {
    renderHand(viewOf({ keptHand: true }));
    const look = await openLook('3');
    expect(setLibraryActivity).toHaveBeenCalledWith({ kind: 'look', count: 3 });
    expect(look.map((el) => el.dataset.cardName)).toEqual([
      'Grizzly Bears',
      'Forest',
      'Giant Growth',
    ]);
    // Every lane is offered, each saying which end is the top.
    expect(screen.getByTestId('look-lane-top')).toHaveTextContent(
      'left is the top card'
    );
    expect(screen.getByTestId('look-lane-exile')).toBeInTheDocument();

    press('ArrowRight', true);
    press('ArrowRight');
    press('b');
    // Focus moved on from the card just sent.
    press('e');
    expect(lanesOf()).toEqual([
      'Forest:top',
      'Giant Growth:bottom',
      'Grizzly Bears:exile',
    ]);
    expect(dispatch).not.toHaveBeenCalled();

    press('Enter');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      arranged({ top: ['p1:21'], bottom: ['p1:22'], exile: ['p1:20'] })
    );
    expect(screen.queryByTestId('look-at-top')).not.toBeInTheDocument();
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });

  it('scries with only the top and bottom lanes', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('2', 'scry');
    expect(screen.getByRole('dialog', { name: 'Scry 2' })).toBeVisible();
    expect(screen.queryByTestId('look-lane-graveyard')).toBeNull();
    press('g');
    press('ArrowRight');
    press('b');
    expect(lanesOf()).toEqual(['Grizzly Bears:top', 'Forest:bottom']);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(dispatch).toHaveBeenCalledWith(
      arranged({ top: ['p1:20'], bottom: ['p1:21'] })
    );
  });

  it('sends the cards not yet placed to the bottom', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('3', 'scry');
    press('ArrowRight');
    press('t');
    press('r');
    expect(lanesOf()).toEqual([
      'Forest:top',
      'Grizzly Bears:bottom',
      'Giant Growth:bottom',
    ]);
  });

  it('takes up to the set number into the hand, the rest to the bottom', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('3', 'take', '1');
    expect(screen.getByRole('dialog', { name: 'Look at 3, take 1' }));
    expect(lanesOf().every((lane) => lane.endsWith(':bottom'))).toBe(true);
    press('h');
    press('ArrowLeft');
    // The hand is full, so this one stays put.
    press('h');
    expect(lanesOf()).toEqual([
      'Forest:bottom',
      'Giant Growth:bottom',
      'Grizzly Bears:hand',
    ]);
    fireEvent.click(screen.getByLabelText('Bottom in random order'));
    press('Enter');
    expect(dispatch).toHaveBeenCalledWith(
      arranged(
        { bottom: ['p1:21', 'p1:22'], hand: ['p1:20'] },
        { bottomRandom: true }
      )
    );
  });

  it('ponders, shuffling instead of keeping the order', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Look at top…' }));
    fireEvent.change(screen.getByLabelText('Effect'), {
      target: { value: 'ponder' },
    });
    // Ponder looks at three unless told otherwise.
    expect(screen.getByLabelText('How many cards?')).toHaveValue(3);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findAllByTestId('look-card');
    press('s');
    expect(screen.getByLabelText('Shuffle instead (S)')).toBeChecked();
    press('Enter');
    expect(dispatch).toHaveBeenCalledWith(
      arranged({ top: ['p1:20', 'p1:21', 'p1:22'] }, { shuffleAfter: true })
    );
  });

  it('applies a one-card look in one click or key', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('1', 'surveil');
    fireEvent.click(screen.getByRole('button', { name: 'Graveyard (G)' }));
    expect(dispatch).toHaveBeenCalledWith(arranged({ graveyard: ['p1:20'] }));
    expect(screen.queryByTestId('look-at-top')).toBeNull();

    await openLook('1', 'scry');
    press('b');
    expect(dispatch).toHaveBeenLastCalledWith(arranged({ bottom: ['p1:20'] }));
  });

  it('shows the bottom card when the board asks', async () => {
    renderHand(viewOf({ keptHand: true }));
    act(() => pushHandCommand('viewBottom'));
    const bottom = await screen.findByTestId('bottom-card');
    await waitFor(() =>
      expect(within(bottom).getByTestId('card')).toHaveAttribute(
        'data-card-name',
        'Island'
      )
    );
    expect(setLibraryActivity).toHaveBeenCalledWith({ kind: 'other' });
  });

  it('never opens the bottom card or help over an open look', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('3');
    act(() => pushHandCommand('viewBottom'));
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.queryByTestId('bottom-card')).toBeNull();
    expect(screen.getByTestId('look-at-top')).toBeInTheDocument();
    expect(setLibraryActivity).toHaveBeenLastCalledWith({
      kind: 'look',
      count: 3,
    });
  });

  it('lists the cards as options grouped by lane', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('2', 'scry');
    const list = screen.getByRole('listbox', { name: 'Looked-at cards' });
    expect(list).toHaveFocus();
    expect(
      within(list).getByRole('group', { name: 'Top, left is the top card' })
    ).toBeInTheDocument();
    const [first, second] = within(list).getAllByRole('option');
    expect(list).toHaveAttribute('aria-activedescendant', first.id);
    press('ArrowRight');
    expect(list).toHaveAttribute('aria-activedescendant', second.id);
    expect(second).toHaveAttribute('aria-selected', 'true');
  });

  it('names the card in a one-card look', async () => {
    renderHand(viewOf({ keptHand: true }));
    await openLook('1', 'scry');
    expect(screen.getByTestId('look-single-name')).toHaveTextContent(
      'Grizzly Bears'
    );
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

    fireEvent.change(screen.getByLabelText('Search the library'), {
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
      picks: [{ instanceId: 'p1:23', to: 'battlefield' }],
      shuffle: true,
    });
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });

  it('sends each picked card to its own destination in one action', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    const tile = async (name: string) =>
      within(
        (await screen.findAllByTestId('search-card')).find(
          (el) => within(el).getByTestId('card').dataset.cardName === name
        )!
      ).getByTestId('card');
    fireEvent.click(await tile('Forest'));
    fireEvent.click(await tile('Island'));
    fireEvent.click(await tile('Grizzly Bears'));
    expect(screen.getAllByTestId('search-pick')).toHaveLength(3);

    // "All to" changes every pick; a pick's own choice overrides it.
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'top' },
    });
    expect(
      (screen.getByLabelText('Destination for 2. Island') as HTMLSelectElement)
        .value
    ).toBe('top');
    fireEvent.change(screen.getByLabelText('Destination for 1. Forest'), {
      target: { value: 'battlefieldTapped' },
    });
    fireEvent.change(screen.getByLabelText('Destination for 2. Island'), {
      target: { value: 'hand' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Unpick 3. Grizzly Bears' })
    );
    fireEvent.click(screen.getByLabelText('Shuffle afterwards'));
    fireEvent.click(screen.getByRole('button', { name: 'Move 2' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'searchLibrary',
      playerId: 'p1',
      picks: [
        { instanceId: 'p1:21', to: 'battlefield', tapped: true },
        { instanceId: 'p1:23', to: 'hand' },
      ],
      shuffle: false,
    });
  });

  it('forgets a pick that leaves the library, even if it comes back', async () => {
    const { rerender } = renderHand(viewOf({ keptHand: true }));
    const again = (seq: number) =>
      rerender(
        <ContextMenuProvider>
          <CardPreviewProvider>
            <Hand store={storeOf(viewOf({ keptHand: true, seq }))} />
          </CardPreviewProvider>
        </ContextMenuProvider>
      );
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    const forest = (await screen.findAllByTestId('search-card')).find(
      (el) => within(el).getByTestId('card').dataset.cardName === 'Forest'
    )!;
    fireEvent.click(within(forest).getByTestId('card'));
    fireEvent.change(screen.getByLabelText('Destination for 1. Forest'), {
      target: { value: 'exile' },
    });

    getLibrary.mockResolvedValueOnce(
      library.filter((card) => card.instanceId !== 'p1:21')
    );
    again(2);
    await waitFor(() =>
      expect(screen.getAllByTestId('search-card')).toHaveLength(3)
    );
    expect(screen.queryAllByTestId('search-pick')).toHaveLength(0);
    again(3);
    await waitFor(() =>
      expect(screen.getAllByTestId('search-card')).toHaveLength(4)
    );
    expect(screen.queryAllByTestId('search-pick')).toHaveLength(0);
  });

  it('searches rules text and advanced syntax once facts arrive', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    expect(await screen.findAllByTestId('search-card')).toHaveLength(4);
    const search = (value: string) =>
      fireEvent.change(screen.getByLabelText('Search the library'), {
        target: { value },
      });
    const names = () =>
      screen
        .queryAllByTestId('search-card')
        .map((el) => within(el).getByTestId('card').dataset.cardName);

    search('"end of turn"');
    expect(await screen.findAllByTestId('search-card')).toHaveLength(1);
    expect(names()).toEqual(['Giant Growth']);
    search('t:basic');
    expect(names()).toEqual(['Forest', 'Island']);
    search('t:basic c:c id:g');
    expect(names()).toEqual(['Forest']);
    search('-t:land mv<=1 or t:creature');
    expect(names()).toEqual(['Giant Growth', 'Grizzly Bears']);
    expect(screen.queryByTestId('query-error')).toBeNull();
  });

  it('shows parse errors inline and keeps the valid terms', async () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    await screen.findAllByTestId('search-card');
    fireEvent.change(screen.getByLabelText('Search the library'), {
      target: { value: 't:creature foo:bar' },
    });
    expect(screen.getByTestId('query-error')).toHaveTextContent(
      "Unknown keyword 'foo'"
    );
    expect(screen.getAllByTestId('search-card')).toHaveLength(1);
  });

  it('opens search and look from the board, or from V and Shift+V', async () => {
    renderHand(viewOf({ keptHand: true }));
    const dialog = (name: string) => screen.queryByRole('dialog', { name });
    act(() => pushHandCommand('search'));
    expect(dialog('Search your library')).toBeInTheDocument();
    // Never over the dialog already open.
    act(() => pushHandCommand('look'));
    expect(dialog('Look at the top of your library')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.keyDown(window, { key: 'V', shiftKey: true });
    expect(dialog('Look at the top of your library')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'v' });
    expect(dialog('Search your library')).toBeInTheDocument();
    await waitFor(() => expect(getLibrary).toHaveBeenCalled());
  });

  it('opens nothing from the board over a "Put Xth from top" prompt', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[1]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Put Xth from top…' })
    );
    for (const command of ['search', 'look', 'viewBottom'] as const) {
      act(() => pushHandCommand(command));
    }
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before restarting on R', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.keyDown(window, { key: 'r' });
    expect(
      screen.getByRole('dialog', { name: 'Restart game?' })
    ).toBeInTheDocument();
  });

  it('moves the hovered hand card with its key', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.mouseEnter(cards()[2]);
    fireEvent.keyDown(window, { key: 'b' });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:2',
      to: 'battlefield',
    });
    fireEvent.keyDown(window, { key: 'L', shiftKey: true });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:2',
      to: 'library',
    });
    fireEvent.keyDown(window, { key: 't' });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('ignores hover keys while picking cards', () => {
    renderHand(viewOf({ keptHand: false, mulligans: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    fireEvent.mouseEnter(cards()[0]);
    fireEvent.keyDown(window, { key: 'g' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('Hand reveal until', () => {
  const revealing = (count: number): Partial<PrivateView> => ({
    keptHand: true,
    revealed: {
      source: 'libraryTop',
      cards: library.slice(0, count).map((card) => card.ref!),
    },
  });

  const open = async (patch: Partial<PrivateView> = { keptHand: true }) => {
    const rendered = renderHand(viewOf(patch));
    act(() => pushHandCommand('revealUntil'));
    await screen.findByTestId('reveal-until');
    return rendered;
  };

  const shownCards = () => screen.queryAllByTestId('reveal-until-card');

  it('reveals one more card at a time, telling the table', async () => {
    await open();
    expect(setLibraryActivity).toHaveBeenCalledWith({ kind: 'reveal' });
    await waitFor(() => expect(getLibrary).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Reveal next/ })).toBeEnabled()
    );
    fireEvent.keyDown(window, { key: ' ' });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'libraryTop',
      count: 1,
    });
    // Nothing is shown here until the table is shown it.
    expect(shownCards()).toHaveLength(0);
    // A second press before the view catches up asks for one more.
    fireEvent.keyDown(window, { key: ' ' });
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'reveal', count: 2 })
    );
  });

  it('reveals up to the first card the stop matches, in one reveal', async () => {
    await open(revealing(1));
    await waitFor(() => expect(shownCards()).toHaveLength(1));
    // With no stop, the latest card is the hit.
    expect(shownCards()[0]).toHaveAttribute('data-hit', 'true');
    fireEvent.keyDown(window, { key: '2' });
    const auto = screen.getByRole('button', { name: /Reveal until a hit/ });
    await waitFor(() => expect(auto).toBeEnabled());
    fireEvent.keyDown(window, { key: 'a' });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'libraryTop',
      count: 2,
    });
  });

  it('a free query stop reports mistakes and matches on card facts', async () => {
    await open(revealing(1));
    fireEvent.keyDown(window, { key: '5' });
    const input = screen.getByLabelText('Stop at a card matching');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'foo:1' } });
    expect(screen.getByTestId('reveal-query-error')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'o:target' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('reveal-until')).toHaveFocus();
    const auto = screen.getByRole('button', { name: /Reveal until a hit/ });
    await waitFor(() => expect(auto).toBeEnabled());
    fireEvent.keyDown(window, { key: 'a' });
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'reveal', count: 3 })
    );
  });

  it('finishes with the hit and the rest in one action', async () => {
    await open(revealing(3));
    await waitFor(() => expect(shownCards()).toHaveLength(3));
    // Nonland: Grizzly Bears, the first card, is the hit.
    fireEvent.keyDown(window, { key: '3' });
    expect(shownCards()[0]).toHaveAttribute('data-hit', 'true');
    expect(screen.getByTestId('reveal-until-status')).toHaveTextContent(
      'Hit: Grizzly Bears'
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'arrangeTop',
      playerId: 'p1',
      top: [],
      bottom: ['p1:21', 'p1:22'],
      graveyard: [],
      exile: [],
      hand: ['p1:20'],
      bottomRandom: true,
    });
    expect(screen.queryByTestId('reveal-until')).toBeNull();
  });

  it('can pick another hit, the battlefield and the graveyard', async () => {
    await open(revealing(3));
    await waitFor(() => expect(shownCards()).toHaveLength(3));
    fireEvent.click(shownCards()[1]!);
    fireEvent.keyDown(window, { key: 'b' });
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'arrangeTop',
      playerId: 'p1',
      top: [],
      bottom: [],
      graveyard: ['p1:20', 'p1:22'],
      exile: [],
      hand: [],
      battlefield: ['p1:21'],
    });
  });

  it('clicking the hit leaves no hit, so everything goes with the rest', async () => {
    await open(revealing(2));
    await waitFor(() => expect(shownCards()).toHaveLength(2));
    fireEvent.click(shownCards()[1]!);
    expect(shownCards()[1]).not.toHaveAttribute('data-hit');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bottom: ['p1:20', 'p1:21'],
        hand: [],
        bottomRandom: true,
      })
    );
  });

  it('a chosen hit that is undone away falls back to the automatic one', async () => {
    const { rerender } = await open(revealing(3));
    await waitFor(() => expect(shownCards()).toHaveLength(3));
    fireEvent.click(shownCards()[2]!);
    fireEvent.click(shownCards()[1]!);
    expect(shownCards()[1]).toHaveAttribute('data-hit', 'true');
    rerender(
      <ContextMenuProvider>
        <CardPreviewProvider>
          <Hand store={storeOf(viewOf({ ...revealing(1), seq: 2 }))} />
        </CardPreviewProvider>
      </ContextMenuProvider>
    );
    await waitFor(() => expect(shownCards()).toHaveLength(1));
    expect(shownCards()[0]).toHaveAttribute('data-hit', 'true');
  });

  it('closing leaves the reveal as it is', async () => {
    await open(revealing(2));
    const dialog = screen.getByTestId('reveal-until');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('reveal-until')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setLibraryActivity).toHaveBeenLastCalledWith(null);
  });
});

describe('Hand always looking at the top card', () => {
  it('shows the top card in the hand only while on', async () => {
    renderHand(viewOf({ keptHand: true }));
    await waitFor(() => expect(getLookAtTop).toHaveBeenCalled());
    expect(screen.queryByTestId('own-top-card')).toBeNull();
    act(() => pushLookAtTop(true));
    const peek = await screen.findByTestId('own-top-card');
    await waitFor(() =>
      expect(within(peek).getByTestId('card')).toHaveAttribute(
        'data-card-name',
        'Grizzly Bears'
      )
    );
    act(() => pushLookAtTop(false));
    expect(screen.queryByTestId('own-top-card')).toBeNull();
  });
});

describe('Hand reveals to one player', () => {
  const pod: RevealTarget[] = [
    { playerId: 'bob', name: 'Bob', ready: true },
    {
      playerId: 'dave',
      name: 'Dave',
      ready: false,
      why: 'needs a newer version',
    },
  ];

  const inPod = async (patch: Partial<PrivateView> = {}) => {
    revealTargets = pod;
    const result = renderHand(viewOf({ keptHand: true, ...patch }));
    // The targets arrive after the first render.
    act(() => pushRevealTargets(pod));
    return result;
  };

  it('offers everyone first, then each player, greying out an old build', async () => {
    await inPod();
    fireEvent.contextMenu(cards()[2]);
    expect(
      screen.getByRole('menuitem', { name: 'Reveal to everyone' })
    ).toBeEnabled();
    expect(
      screen.getByRole('menuitem', {
        name: 'Reveal to Dave (needs a newer version)',
      })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal to Bob' }));
    expect(revealTo).toHaveBeenCalledWith(
      { to: 'bob', source: 'card', instanceId: 'p1:2' },
      undefined
    );
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.contextMenu(cards()[1]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal to everyone' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'card',
      instanceId: 'p1:1',
    });
  });

  it('asks who to show the whole hand', async () => {
    await inPod();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal hand' }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reveal hand to Bob' })
    );
    expect(revealTo).toHaveBeenCalledWith(
      { to: 'bob', source: 'hand' },
      undefined
    );
  });

  it('reveals the hovered card to everyone with R, rather than restarting', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.mouseEnter(cards()[3]);
    fireEvent.keyDown(window, { key: 'r' });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'reveal',
      playerId: 'p1',
      source: 'card',
      instanceId: 'p1:3',
    });
    expect(screen.queryByRole('dialog', { name: 'Restart game?' })).toBeNull();
    fireEvent.mouseLeave(cards()[3]);
    fireEvent.keyDown(window, { key: 'r' });
    expect(
      screen.getByRole('dialog', { name: 'Restart game?' })
    ).toBeInTheDocument();
  });

  it('says who the player is showing, and stops on request', async () => {
    await inPod({ showing: { to: 'bob', source: 'hand', count: 7 } });
    expect(screen.getByTestId('hand-showing-banner')).toHaveTextContent(
      'Only Bob can see the 7 cards you showed'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stopShowing).toHaveBeenCalled();
  });

  it('shows the picks to one player before moving them, or to everyone', async () => {
    await inPod();
    const tile = async (name: string) =>
      within(
        (await screen.findAllByTestId('search-card')).find(
          (el) => within(el).getByTestId('card').dataset.cardName === name
        )!
      ).getByTestId('card');
    const search = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
      fireEvent.click(await tile('Forest'));
      fireEvent.click(screen.getByLabelText('Reveal picked cards'));
    };

    await search();
    const to = screen.getByLabelText('Reveal picked cards to');
    expect(
      within(to).getByRole('option', {
        name: 'Dave (needs a newer version)',
      })
    ).toBeDisabled();
    expect(screen.getByTestId('reveal-target-hint')).toBeInTheDocument();
    fireEvent.change(to, { target: { value: 'bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move 1 and shuffle' }));
    const search1 = {
      type: 'searchLibrary',
      playerId: 'p1',
      picks: [{ instanceId: 'p1:21', to: 'hand' }],
      shuffle: true,
    };
    expect(revealTo).toHaveBeenCalledWith(
      { to: 'bob', source: 'search', instanceIds: ['p1:21'] },
      search1
    );
    expect(dispatch).not.toHaveBeenCalled();

    await search();
    fireEvent.click(screen.getByRole('button', { name: 'Move 1 and shuffle' }));
    expect(dispatch).toHaveBeenCalledWith({ ...search1, reveal: true });
  });

  const searchTile = async (name: string) =>
    within(
      (await screen.findAllByTestId('search-card')).find(
        (el) => within(el).getByTestId('card').dataset.cardName === name
      )!
    ).getByTestId('card');

  it('never widens a reveal to everyone when the chosen player drops out', async () => {
    await inPod();
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    fireEvent.click(await searchTile('Forest'));
    fireEvent.click(screen.getByLabelText('Reveal picked cards'));
    const to = screen.getByLabelText('Reveal picked cards to');
    fireEvent.change(to, { target: { value: 'bob' } });
    const move = screen.getByRole('button', { name: 'Move 1 and shuffle' });
    expect(move).toBeEnabled();

    // Bob's build stops taking reveals: the choice stays, flagged.
    act(() =>
      pushRevealTargets([
        { playerId: 'bob', name: 'Bob', ready: false, why: 'no game open' },
      ])
    );
    expect((to as HTMLSelectElement).value).toBe('bob');
    expect(screen.getByTestId('reveal-target-unavailable')).toHaveTextContent(
      'Bob can’t be shown cards now (no game open)'
    );
    expect(move).toBeDisabled();
    fireEvent.click(move);

    // Bob leaves altogether: still Bob, still blocked.
    act(() => pushRevealTargets([]));
    expect((to as HTMLSelectElement).value).toBe('bob');
    expect(
      within(to).getByRole('option', { name: 'Bob (left the table)' })
    ).toBeDisabled();
    expect(move).toBeDisabled();
    fireEvent.click(move);
    expect(dispatch).not.toHaveBeenCalled();
    expect(revealTo).not.toHaveBeenCalled();

    // Only choosing again lets it go ahead.
    fireEvent.change(to, { target: { value: 'everyone' } });
    expect(move).toBeEnabled();
  });

  it('reveals only the picks that end up hidden', async () => {
    await inPod();
    fireEvent.click(screen.getByRole('button', { name: 'Search library…' }));
    fireEvent.click(await searchTile('Forest'));
    fireEvent.click(await searchTile('Island'));
    fireEvent.change(screen.getByLabelText('Destination for 2. Island'), {
      target: { value: 'graveyard' },
    });
    fireEvent.click(screen.getByLabelText('Reveal picked cards'));
    fireEvent.change(screen.getByLabelText('Reveal picked cards to'), {
      target: { value: 'bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 and shuffle' }));
    expect(revealTo).toHaveBeenCalledWith(
      { to: 'bob', source: 'search', instanceIds: ['p1:21'] },
      expect.objectContaining({ type: 'searchLibrary' })
    );
  });

  it('shows a refused reveal until the player closes it', async () => {
    await inPod();
    act(() =>
      pushPrivateLog([
        {
          id: 3,
          at: 0,
          text: "Bob can't be shown cards now, so nothing was revealed or moved.",
          notice: true,
        },
      ])
    );
    const notice = screen.getByTestId('hand-reveal-notice');
    expect(notice).toHaveTextContent("Bob can't be shown cards now");
    fireEvent.click(within(notice).getByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('hand-reveal-notice')).toBeNull();
  });

  it('keeps cards shown to the player until dismissed, and a private log', async () => {
    await inPod();
    expect(screen.queryByTestId('shown-to-you')).toBeNull();
    act(() =>
      pushShownToYou([
        {
          key: 'bob:1',
          from: 'bob',
          fromName: 'Bob',
          source: 'card',
          cards: [handCard(40).ref!],
          at: 0,
          ended: true,
        },
      ])
    );
    const tray = screen.getByTestId('shown-to-you');
    expect(within(tray).getByTestId('card')).toHaveAttribute(
      'data-card-name',
      'Card 40'
    );
    expect(tray).toHaveTextContent(
      'Bob: a card from their hand (no longer shown)'
    );
    fireEvent.click(
      within(tray).getByRole('button', {
        name: 'Dismiss the cards Bob showed you',
      })
    );
    expect(dismissShown).toHaveBeenCalledWith('bob:1');

    expect(screen.queryByRole('button', { name: 'Private log' })).toBeNull();
    act(() =>
      pushPrivateLog([
        {
          id: 1,
          at: 0,
          text: 'Bob showed you a card from their hand: Card 40',
        },
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Private log' }));
    expect(screen.getByTestId('private-log')).toHaveTextContent(
      'Bob showed you a card from their hand: Card 40'
    );
  });
});

describe('Hand known cards and seen list', () => {
  const refOf = (n: number): CardRef => ({
    id: `id-${n}`,
    name: `Card ${n}`,
    typeLine: 'Creature',
    faces: [{ name: `Card ${n}`, typeLine: 'Creature' }],
  });
  const known = (n: number, random = false) => ({
    instanceId: `p1:${n}`,
    ref: refOf(n),
    ...(random && { random: true as const }),
  });

  it('shows the known ends of the library, and nothing when none', () => {
    const { unmount } = renderHand(viewOf({ known: { top: [], bottom: [] } }));
    expect(screen.queryByTestId('known-cards')).toBeNull();
    unmount();

    renderHand(
      viewOf({
        known: {
          top: [known(10), known(11)],
          bottom: [known(12, true), known(13, true), known(14)],
        },
      })
    );
    const strip = screen.getByTestId('known-cards');
    expect(strip).toHaveTextContent('Known top:');
    const names = (testId: string) =>
      within(screen.getByTestId(testId))
        .getAllByTestId('card-pill')
        .map((pill) => pill.textContent);
    expect(names('known-top')).toEqual(['Card 10', 'Card 11']);
    expect(names('known-bottom')).toEqual(['Card 12', 'Card 13', 'Card 14']);
    const pills = within(screen.getByTestId('known-bottom')).getAllByTestId(
      'card-pill'
    );
    expect(pills[0]).toHaveAttribute('title', 'In a random order');
    expect(pills[2]).not.toHaveAttribute('title');
  });

  it('counts known cards past the first few', () => {
    renderHand(
      viewOf({
        known: {
          top: Array.from({ length: 9 }, (_, i) => known(20 + i)),
          bottom: [],
        },
      })
    );
    expect(screen.getByTestId('known-top')).toHaveTextContent('… +3');
  });

  it('lists the cards shown to the player in the private log', () => {
    renderHand(viewOf());
    expect(screen.queryByRole('button', { name: 'Private log' })).toBeNull();
    act(() =>
      pushSeenByYou([
        {
          id: 1,
          player: 'bob',
          playerName: 'Bob',
          to: 'you',
          source: 'card',
          cards: [refOf(40)],
          at: 0,
        },
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Private log' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Shown to you (1)' }));
    expect(screen.getByTestId('seen-by-you')).toHaveTextContent(
      'Bob showed you a card from their hand'
    );
    expect(screen.getByTestId('seen-by-you')).toHaveTextContent('Card 40');
  });
});

describe('Hand sideboard', () => {
  const sideCard = (n: number, name: string): CardView => ({
    ...libraryCard(n, name, 'Instant'),
    zone: 'sideboard',
  });
  const sideboard = [sideCard(30, 'Lightning Bolt'), sideCard(31, 'Duress')];

  const openSideboard = async () => {
    renderHand(viewOf({ keptHand: true, sideboard, sideboardCount: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Sideboard (2)' }));
    return screen.findAllByTestId('sideboard-card');
  };

  it('offers the sideboard only when there is one', () => {
    renderHand(viewOf({ keptHand: true, sideboard: [] }));
    expect(
      screen.queryByRole('button', { name: /Sideboard/ })
    ).not.toBeInTheDocument();
  });

  it('fetches picked cards to the hand in one action', async () => {
    const [bolt] = await openSideboard();
    fireEvent.click(within(bolt).getByTestId('card'));
    fireEvent.click(screen.getByRole('button', { name: 'Move 1' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ['p1:31'],
      to: 'hand',
    });
    expect(screen.queryByTestId('sideboard-browser')).not.toBeInTheDocument();
  });

  it('puts picks on top of the library, or moves one from its menu', async () => {
    const tiles = await openSideboard();
    tiles.forEach((tile) => fireEvent.click(within(tile).getByTestId('card')));
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'top' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move 2' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ['p1:31', 'p1:30'],
      to: 'library',
      index: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sideboard (2)' }));
    const [first] = await screen.findAllByTestId('sideboard-card');
    fireEvent.contextMenu(within(first).getByTestId('card'));
    expect(
      screen.queryByRole('menuitem', { name: 'Move to sideboard' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to exile' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:31',
      to: 'exile',
    });
  });

  it('puts a hand card into the sideboard from its menu', () => {
    renderHand(viewOf({ keptHand: true }));
    fireEvent.contextMenu(cards()[2]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Move to sideboard' })
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'moveCard',
      instanceId: 'p1:2',
      to: 'sideboard',
    });
  });
});
