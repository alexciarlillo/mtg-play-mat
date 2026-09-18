import type { CardView } from '@shared/game';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import BattlefieldCard from './BattlefieldCard';

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
});
