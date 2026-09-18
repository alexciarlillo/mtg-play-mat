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
};

const dispatch = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.assign(window, { api: { dispatch } });
});

afterEach(() => {
  dispatch.mockClear();
});

const renderCard = () =>
  render(
    <ContextMenuProvider>
      <BattlefieldCard card={card} />
    </ContextMenuProvider>
  );

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
});
