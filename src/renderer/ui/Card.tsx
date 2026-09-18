import type { CardView } from '@shared/game';
import classNames from 'classnames';
import type { MouseEvent } from 'react';

import CardImg from './CardImg';
import { useContextMenu } from './ContextMenuProvider';
import type { ContextMenuSpec } from './ContextMenuStore';

interface Props {
  card: CardView;
  onClick?(card: CardView): void;
  menu?: ContextMenuSpec[];
  className?: string;
}

// A card face that renders whatever view main sent. Any change goes back
// to main as an action; nothing about the card is kept locally.
const Card = ({ card, onClick, menu = [], className }: Props) => {
  const contextMenu = useContextMenu();
  const interactive = Boolean(onClick) || menu.length > 0;

  const handleContextMenu = (e: MouseEvent) => {
    if (menu.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    contextMenu.open({ specs: menu, x: e.pageX, y: e.pageY });
  };

  // react-draggable's user-select hack injects a <style> tag, which the
  // CSP blocks, so text selection is disabled with a class instead.
  return (
    <div
      data-testid="card"
      data-instance-id={card.instanceId}
      className={classNames(
        'handle',
        'origin-center',
        'flex',
        'justify-center',
        'items-center',
        'aspect-card',
        'w-52',
        'ring-amber-300',
        'rounded-lg',
        'select-none',
        {
          'rotate-90': card.tapped,
          'hover:ring-4 hover:cursor-pointer': interactive,
        },
        className
      )}
      onClick={onClick && (() => onClick(card))}
      onContextMenu={handleContextMenu}
    >
      <CardImg
        scryfallId={card.faceDown ? undefined : card.ref?.id}
        name={card.faceDown ? 'Face-down card' : card.ref?.name}
      />
    </div>
  );
};

export default Card;
