import type { CardView } from '@shared/game';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Card from './Card';
import { CardBackProvider } from './CardBackProvider';
import { ContextMenuProvider } from './ContextMenuProvider';

const bears: CardView = {
  instanceId: 'p1:3',
  ref: {
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: { x: 0, y: 0 },
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

const renderCard = (props: Partial<Parameters<typeof Card>[0]> = {}) =>
  render(
    <ContextMenuProvider>
      <Card card={bears} {...props} />
    </ContextMenuProvider>
  );

describe('Card', () => {
  it('renders the cached image for the card', () => {
    renderCard();

    expect(screen.getByAltText('Grizzly Bears')).toHaveAttribute(
      'src',
      'card://409f9b88-f03e-40b6-9883-68c14c37c0de/0/normal'
    );
    expect(screen.getByTestId('card')).toHaveAttribute(
      'data-instance-id',
      'p1:3'
    );
  });

  it('shows tapped state from the view', () => {
    renderCard({ card: { ...bears, tapped: true } });
    expect(screen.getByTestId('card')).toHaveClass('rotate-90');
  });

  it('shows the card back when face down or unknown', () => {
    renderCard({ card: { ...bears, ref: null, faceDown: true } });
    const img = screen.getByAltText('Face-down card');
    expect(img.getAttribute('src')).not.toContain('scryfall');
  });

  it('shows its owner’s back when hidden, and the standard one otherwise', () => {
    const back = 'c'.repeat(64);
    const hidden = { ...bears, ref: null, faceDown: true };
    render(
      <ContextMenuProvider>
        <CardBackProvider backs={{ p1: back, p2: null }}>
          <Card card={hidden} />
          <Card card={{ ...hidden, instanceId: 'p2:1', owner: 'p2' }} />
        </CardBackProvider>
      </ContextMenuProvider>
    );
    const [mine, theirs] = screen.getAllByAltText('Face-down card');
    expect(mine).toHaveAttribute('src', `mat://${back}`);
    expect(theirs.getAttribute('src')).not.toContain('mat://');
  });

  it('falls back to the standard back when a custom one fails', () => {
    render(
      <ContextMenuProvider>
        <CardBackProvider backs={{ p1: 'c'.repeat(64) }}>
          <Card card={{ ...bears, ref: null, faceDown: true }} />
        </CardBackProvider>
      </ContextMenuProvider>
    );
    const img = screen.getByAltText('Face-down card');
    fireEvent.error(img);
    expect(img.getAttribute('src')).not.toContain('mat://');
  });

  it('reports clicks with the card', () => {
    const onClick = vi.fn();
    renderCard({ onClick });

    fireEvent.click(screen.getByTestId('card'));

    expect(onClick).toHaveBeenCalledWith(bears);
  });

  it('opens its context menu', () => {
    const destroy = vi.fn();
    renderCard({ menu: [{ title: 'Destroy', action: destroy }] });

    fireEvent.contextMenu(screen.getByTestId('card'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Destroy' }));

    expect(destroy).toHaveBeenCalled();
  });

  it('has no context menu without items', () => {
    renderCard();
    fireEvent.contextMenu(screen.getByTestId('card'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('wears a crown only when it is a commander', () => {
    const { rerender } = renderCard();
    expect(screen.queryByTestId('commander-badge')).not.toBeInTheDocument();
    rerender(
      <ContextMenuProvider>
        <Card card={{ ...bears, isCommander: true, commanderCasts: 0 }} />
      </ContextMenuProvider>
    );
    expect(screen.getByTestId('commander-badge')).toHaveAttribute(
      'title',
      'Commander'
    );
  });
});
