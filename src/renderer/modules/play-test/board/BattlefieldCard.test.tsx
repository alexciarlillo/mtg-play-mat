import type { CardView } from '@shared/game';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardPreviewProvider } from '../../../ui/CardPreview';
import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import { useGameShortcuts } from '../common/useGameShortcuts';
import BattlefieldCard from './BattlefieldCard';
import { SelectionContext, SelectionStore } from './selection';

const card: CardView = {
  instanceId: 'p1:7',
  ref: {
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: { x: 40, y: 30 },
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

const dispatch = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => {
  dispatch.mockClear();
});

const renderCard = (
  view: CardView = card,
  props: Partial<Parameters<typeof BattlefieldCard>[0]> = {}
) =>
  render(
    <ContextMenuProvider>
      <BattlefieldCard card={view} {...props} />
    </ContextMenuProvider>
  );

const dfc: CardView = {
  ...card,
  ref: {
    id: '11bf83bb-c95b-4b4f-9a56-ce7a1816307a',
    name: 'Delver of Secrets // Insectile Aberration',
    typeLine: 'Creature — Human Wizard // Creature — Human Insect',
    layout: 'transform',
    faces: [
      { name: 'Delver of Secrets', typeLine: 'Creature — Human Wizard' },
      { name: 'Insectile Aberration', typeLine: 'Creature — Human Insect' },
    ],
  },
};

const clickMenu = (name: string) => {
  fireEvent.contextMenu(screen.getByTestId('card'));
  fireEvent.click(screen.getByRole('menuitem', { name }));
};

describe('BattlefieldCard', () => {
  it('sits at its view position in a sized wrapper', () => {
    renderCard();
    const wrapper = screen.getByTestId('battlefield-card');
    expect(wrapper.style.transform).toBe('translate(40px,30px)');
    expect(wrapper).toContainElement(screen.getByTestId('card'));
  });

  it('toggles tap on click', () => {
    renderCard();
    const face = screen.getByTestId('card');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'toggleTap',
      instanceId: 'p1:7',
    });
  });

  it.each([
    ['Move to graveyard', { to: 'graveyard' }],
    ['Move to exile', { to: 'exile' }],
    ['Move to hand', { to: 'hand' }],
    ['Move to library top', { to: 'library', index: 0 }],
    ['Move to library bottom', { to: 'library' }],
  ])('%s from its context menu', (name, move) => {
    renderCard();
    fireEvent.contextMenu(screen.getByTestId('card'));
    fireEvent.click(screen.getByRole('menuitem', { name }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:7',
      ...move,
    });
  });

  it('offers tap and shuffle but not a move to its own zone', () => {
    renderCard();
    fireEvent.contextMenu(screen.getByTestId('card'));
    const names = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(names).toContain('Tap');
    expect(names).not.toContain('Move to battlefield');

    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Shuffle into library' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'shuffleIntoLibrary',
      instanceId: 'p1:7',
    });
  });

  it('moves to a zone it is dropped on', () => {
    const exile = document.createElement('div');
    exile.dataset.dropZone = 'exile';
    exile.getBoundingClientRect = () =>
      ({ left: 400, right: 500, top: 200, bottom: 400 }) as DOMRect;
    document.body.append(exile);

    renderCard();
    const face = screen.getByTestId('card');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 450, clientY: 300 });
    fireEvent.mouseUp(document, { clientX: 450, clientY: 300 });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:7',
      to: 'exile',
    });
    exile.remove();
  });

  it.each([
    [
      'Add +1/+1 counter',
      { type: 'adjustCounter', counter: '+1/+1', delta: 1 },
    ],
    [
      'Add -1/-1 counter',
      { type: 'adjustCounter', counter: '-1/-1', delta: 1 },
    ],
    ['Turn face down', { type: 'setFaceDown', faceDown: true }],
    ['Create copy', { type: 'copyCard' }],
  ])('%s from its context menu', (name, action) => {
    renderCard();
    clickMenu(name);
    expect(dispatch).toHaveBeenCalledWith({ instanceId: 'p1:7', ...action });
  });

  it('transforms a double-faced card to its next face', () => {
    renderCard(dfc);
    clickMenu('Transform to Insectile Aberration');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'transform',
      instanceId: 'p1:7',
    });
  });

  it('offers no transform to single-faced or face-down cards', () => {
    renderCard({ ...dfc, ref: null, faceDown: true });
    fireEvent.contextMenu(screen.getByTestId('card'));
    const names = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(names.some((n) => n?.startsWith('Transform'))).toBe(false);
    expect(names).toContain('Turn face up');
  });

  it('opens the attach and counter dialogs, and detaches', () => {
    const onAttach = vi.fn();
    const onAddCounter = vi.fn();
    renderCard({ ...card, attachedTo: 'p1:2' }, { onAttach, onAddCounter });
    clickMenu('Attach to…');
    expect(onAttach).toHaveBeenCalledWith({ ...card, attachedTo: 'p1:2' });
    clickMenu('Add counter…');
    expect(onAddCounter).toHaveBeenCalled();
    clickMenu('Detach');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'attach',
      instanceId: 'p1:7',
      to: null,
    });
  });

  it('asks where in the library to put its own permanents only', () => {
    const onPutInLibrary = vi.fn();
    const { unmount } = renderCard(card, { onPutInLibrary });
    clickMenu('Put Xth from top…');
    expect(onPutInLibrary).toHaveBeenCalledWith(card);
    unmount();

    renderCard({ ...card, owner: 'p2' }, { onPutInLibrary });
    fireEvent.contextMenu(screen.getByTestId('card'));
    expect(
      screen.queryByRole('menuitem', { name: 'Put Xth from top…' })
    ).not.toBeInTheDocument();
  });

  it('steps counters from its hover controls without tapping', () => {
    renderCard({ ...card, counters: { charge: 2 } });
    const remove = screen.getByRole('button', {
      name: 'Remove charge counter',
    });
    fireEvent.mouseDown(remove);
    fireEvent.mouseUp(remove);
    fireEvent.click(remove);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'adjustCounter',
      instanceId: 'p1:7',
      counter: 'charge',
      delta: -1,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add +1/+1 counter' }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'adjustCounter',
      instanceId: 'p1:7',
      counter: '+1/+1',
      delta: 1,
    });
  });

  it('shows counters and a modified P/T badge', () => {
    renderCard({
      ...card,
      ref: { ...card.ref!, power: '2', toughness: '2' },
      counters: { '+1/+1': 2 },
    });
    expect(screen.getByTestId('pt-badge')).toHaveTextContent('4/4');
    expect(screen.getByTestId('counter-chip')).toHaveTextContent('+1/+1 ×2');
  });

  it('keeps taking hover keys while the pointer is on its counters', () => {
    const Keys = () => {
      useGameShortcuts(
        {
          seq: 1,
          playerId: 'p1',
          name: 'You',
          life: 20,
          counters: {},
          mulligans: 0,
          keptHand: true,
          zones: { battlefield: [], graveyard: [], exile: [], command: [] },
          handCount: 0,
          libraryCount: 0,
          commanderDamage: [],
          dummies: [],
        },
        {
          enabled: true,
          onHelp: () => {},
          onRestart: () => {},
          onLibraryDialog: () => {},
          turnTracking: false,
        }
      );
      return null;
    };
    const keyed = { ...card, counters: { charge: 2 } };
    render(
      <ContextMenuProvider>
        <CardPreviewProvider>
          <Keys />
          <BattlefieldCard card={keyed} />
        </CardPreviewProvider>
      </ContextMenuProvider>
    );
    const face = screen.getByTestId('card');
    const counters = screen.getByTestId('counter-controls');
    fireEvent.mouseOver(face);
    fireEvent.mouseOut(face, { relatedTarget: counters });
    fireEvent.mouseOver(counters, { relatedTarget: face });
    fireEvent.keyDown(window, { key: 't' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'toggleTap',
      instanceId: 'p1:7',
    });
  });
});

describe('BattlefieldCard in a selection', () => {
  const cards: CardView[] = [
    card,
    { ...card, instanceId: 'p1:8', position: { x: 200, y: 30 } },
    { ...card, instanceId: 'p1:9', position: { x: 360, y: 60 }, tapped: true },
  ];
  const ids = cards.map((each) => each.instanceId);

  const renderGroup = (selected: string[] = ids) => {
    const selection = new SelectionStore();
    selection.sync(cards);
    selection.set(selected);
    const { rerender } = render(
      <ContextMenuProvider>
        <CardPreviewProvider>
          <SelectionContext value={selection}>
            {cards.map((each) => (
              <BattlefieldCard key={each.instanceId} card={each} />
            ))}
          </SelectionContext>
        </CardPreviewProvider>
      </ContextMenuProvider>
    );
    // Main sends fresh objects for every card in each view.
    const freshView = () => {
      const fresh = cards.map((each) => ({ ...each }));
      selection.sync(fresh);
      rerender(
        <ContextMenuProvider>
          <CardPreviewProvider>
            <SelectionContext value={selection}>
              {fresh.map((each) => (
                <BattlefieldCard key={each.instanceId} card={each} />
              ))}
            </SelectionContext>
          </CardPreviewProvider>
        </ContextMenuProvider>
      );
    };
    return Object.assign(selection, { freshView });
  };

  const wrapperOf = (id: string) =>
    faceOf(id).closest<HTMLElement>('[data-testid="battlefield-card"]')!;

  const faceOf = (id: string) =>
    screen.getAllByTestId('card').find((el) => el.dataset.instanceId === id)!;

  it('toggles a card in and out with Shift-click, without tapping', () => {
    const selection = renderGroup([]);
    const face = faceOf('p1:8');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10, shiftKey: true });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10, shiftKey: true });
    expect([...selection.ids]).toEqual(['p1:8']);
    expect(face.closest('[data-selected]')).not.toBeNull();
    expect(face).toHaveClass('ring-4');

    fireEvent.mouseDown(face, { clientX: 10, clientY: 10, shiftKey: true });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10, shiftKey: true });
    expect(selection.ids.size).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('taps only the clicked card, even in a group', () => {
    renderGroup();
    const face = faceOf('p1:7');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'toggleTap',
      instanceId: 'p1:7',
    });
  });

  it('taps only an unselected card', () => {
    renderGroup(['p1:7', 'p1:8']);
    const face = faceOf('p1:9');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10 });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'toggleTap',
      instanceId: 'p1:9',
    });
  });

  it('offers the group items first in a selected card menu', () => {
    const selection = renderGroup();
    fireEvent.contextMenu(faceOf('p1:8'));
    const names = screen.getAllByRole('menuitem').map((i) => i.textContent);
    // Counts only the cards each would change.
    expect(names.slice(0, 3)).toEqual([
      'Tap 2 cards',
      'Untap 1 card',
      'Move 3 to hand',
    ]);
    expect(
      screen.getAllByTestId('menu-heading').map((h) => h.textContent)
    ).toEqual(['3 selected', 'This card']);
    expect(names).toContain('Tap');
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Move 3 to graveyard' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ids,
      to: 'graveyard',
    });

    fireEvent.contextMenu(faceOf('p1:8'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear selection' }));
    expect(selection.ids.size).toBe(0);
  });

  it('rebuilds every selected card menu when one is toggled off', () => {
    renderGroup();
    const face = faceOf('p1:9');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10, shiftKey: true });
    fireEvent.mouseUp(face, { clientX: 10, clientY: 10, shiftKey: true });

    fireEvent.contextMenu(faceOf('p1:7'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Move 2 to graveyard' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ['p1:7', 'p1:8'],
      to: 'graveyard',
    });
  });

  it('leaves the others in place after a jittery Shift-click', () => {
    renderGroup();
    const face = faceOf('p1:8');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10, shiftKey: true });
    fireEvent.mouseMove(document, { clientX: 11, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 11, clientY: 10, shiftKey: true });
    expect(wrapperOf('p1:7')).not.toHaveClass('z-20');
    expect(wrapperOf('p1:7').style.transform).toBe('translate(40px,30px)');
  });

  it('keeps the others following through a fresh view mid-drag', () => {
    const selection = renderGroup();
    const face = faceOf('p1:8');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 50 });
    act(() => selection.freshView());
    expect(wrapperOf('p1:7').style.transform).toBe('translate(60px,70px)');
    fireEvent.mouseUp(document, { clientX: 30, clientY: 50 });
  });

  it('runs hover keys on the whole group', () => {
    const Keys = () => {
      useGameShortcuts(
        {
          seq: 1,
          playerId: 'p1',
          name: 'You',
          life: 20,
          counters: {},
          mulligans: 0,
          keptHand: true,
          zones: { battlefield: [], graveyard: [], exile: [], command: [] },
          handCount: 0,
          libraryCount: 0,
          commanderDamage: [],
          dummies: [],
        },
        {
          enabled: true,
          onHelp: () => {},
          onRestart: () => {},
          onLibraryDialog: () => {},
          turnTracking: false,
        }
      );
      return null;
    };
    const selection = new SelectionStore();
    selection.sync(cards);
    selection.set(ids);
    render(
      <ContextMenuProvider>
        <CardPreviewProvider>
          <Keys />
          <SelectionContext value={selection}>
            {cards.map((each) => (
              <BattlefieldCard key={each.instanceId} card={each} />
            ))}
          </SelectionContext>
        </CardPreviewProvider>
      </ContextMenuProvider>
    );
    fireEvent.mouseOver(faceOf('p1:7'));
    fireEvent.keyDown(window, { key: 't' });
    fireEvent.keyDown(window, { key: 'e' });
    expect(dispatch.mock.calls).toEqual([
      [{ type: 'setTapped', playerId: 'p1', instanceIds: ids, tapped: true }],
      [{ type: 'moveCards', playerId: 'p1', instanceIds: ids, to: 'exile' }],
    ]);
  });

  it('drops the group on a pile as one move', () => {
    const exile = document.createElement('div');
    exile.dataset.dropZone = 'exile';
    exile.getBoundingClientRect = () =>
      ({ left: 400, right: 500, top: 200, bottom: 400 }) as DOMRect;
    document.body.append(exile);

    renderGroup();
    const face = faceOf('p1:8');
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 450, clientY: 300 });
    fireEvent.mouseUp(document, { clientX: 450, clientY: 300 });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ids,
      to: 'exile',
    });
    exile.remove();
  });

  it('drags the others along and keeps their layout on the field', () => {
    const size = (
      name: 'clientWidth' | 'clientHeight' | 'offsetWidth' | 'offsetHeight',
      value: number
    ) => vi.spyOn(HTMLElement.prototype, name, 'get').mockReturnValue(value);
    const spies = [
      size('clientWidth', 1000),
      size('clientHeight', 600),
      size('offsetWidth', 100),
      size('offsetHeight', 140),
    ];
    renderGroup();
    const face = faceOf('p1:8');
    const follower = faceOf('p1:7').closest<HTMLElement>(
      '[data-testid="battlefield-card"]'
    )!;
    fireEvent.mouseDown(face, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 50 });
    expect(follower.style.transform).toBe('translate(60px,70px)');
    fireEvent.mouseUp(document, { clientX: 30, clientY: 50 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'setPositions',
      playerId: 'p1',
      positions: [
        { instanceId: 'p1:7', position: { x: 60, y: 70 } },
        { instanceId: 'p1:8', position: { x: 220, y: 70 } },
        { instanceId: 'p1:9', position: { x: 380, y: 100 } },
      ],
    });

    // Far to the right, the group stops where its last card fits.
    const last = faceOf('p1:9');
    fireEvent.mouseDown(last, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 400, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 2000, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 2000, clientY: 10 });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'setPositions',
      playerId: 'p1',
      positions: [
        { instanceId: 'p1:7', position: { x: 580, y: 30 } },
        { instanceId: 'p1:8', position: { x: 740, y: 30 } },
        { instanceId: 'p1:9', position: { x: 900, y: 60 } },
      ],
    });
    spies.forEach((spy) => spy.mockRestore());
  });
});
