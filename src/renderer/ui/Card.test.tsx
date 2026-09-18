import CardModel from '@shared/models/CardModel';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Card from './Card';
import { ContextMenuProvider } from './ContextMenuProvider';

const bears = new CardModel({
  id: 'bears-1',
  key: 1,
  name: 'Grizzly Bears',
  scryfallId: '409f9b88-f03e-40b6-9883-68c14c37c0de',
});

const renderCard = (props: Partial<Parameters<typeof Card>[0]> = {}) =>
  render(
    <ContextMenuProvider>
      <Card card={bears} location="battlefield" {...props} />
    </ContextMenuProvider>
  );

describe('Card', () => {
  it('renders a draggable battlefield card with its Scryfall image', () => {
    renderCard();

    expect(screen.getByAltText('Grizzly Bears')).toHaveAttribute(
      'src',
      expect.stringContaining('cards.scryfall.io')
    );
  });

  it('plays a hand card when clicked', () => {
    const onPlayed = vi.fn();
    renderCard({
      location: 'hand',
      draggable: false,
      playable: true,
      onPlayed,
    });

    fireEvent.click(screen.getByTestId('card'));

    expect(onPlayed).toHaveBeenCalledWith(bears);
  });

  it('opens a context menu that destroys the card', () => {
    const onDestroy = vi.fn();
    renderCard({ onDestroy });

    fireEvent.contextMenu(screen.getByTestId('card'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Destroy' }));

    expect(onDestroy).toHaveBeenCalledWith(bears);
    expect(
      screen.queryByRole('menuitem', { name: 'Exile' })
    ).not.toBeInTheDocument();
  });
});
