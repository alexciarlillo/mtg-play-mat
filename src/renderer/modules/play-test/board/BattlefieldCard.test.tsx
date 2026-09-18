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

  it('destroys to the graveyard from its context menu', () => {
    renderCard();
    fireEvent.contextMenu(screen.getByTestId('card'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Destroy' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'moveCard',
      instanceId: 'p1:7',
      to: 'graveyard',
    });
  });
});
