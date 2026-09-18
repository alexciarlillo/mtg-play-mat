import type { CardView } from '@shared/game';
import classNames from 'classnames';
import { type MouseEvent, useEffect } from 'react';

import CardArt from './CardArt';
import CardBadges from './CardBadges';
import { useCardPreview } from './CardPreview';
import { type CardSize, cardWidths } from './cardSizes';
import { useContextMenu } from './ContextMenuProvider';
import type { ContextMenuSpec } from './ContextMenuStore';

interface Props {
  card: CardView;
  onClick?(card: CardView): void;
  menu?: ContextMenuSpec[];
  size?: CardSize;
  className?: string;
  // Shows the owner the front of their own face-down card.
  reveal?: boolean;
}

// A card face that renders whatever view main sent. Any change goes back
// to main as an action; nothing about the card is kept locally.
const Card = ({
  card,
  onClick,
  menu = [],
  size = 'lg',
  className,
  reveal = false,
}: Props) => {
  const contextMenu = useContextMenu();
  const preview = useCardPreview();
  const interactive = Boolean(onClick) || menu.length > 0;
  const { instanceId } = card;
  const hidden = card.faceDown && !reveal;

  // A card that leaves the window while hovered never gets mouseleave.
  useEffect(() => () => preview.hide(instanceId), [preview, instanceId]);

  const handleContextMenu = (e: MouseEvent) => {
    if (menu.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    preview.hide(instanceId);
    contextMenu.open({ specs: menu, x: e.pageX, y: e.pageY });
  };

  // react-draggable's user-select hack injects a <style> tag, which the
  // CSP blocks, so text selection is disabled with a class instead.
  return (
    <div
      data-testid="card"
      data-instance-id={instanceId}
      data-card-name={hidden ? undefined : card.ref?.name}
      data-face-index={card.faceIndex}
      data-face-down={card.faceDown || undefined}
      data-token={card.isToken || undefined}
      className={classNames(
        'handle',
        'relative',
        'origin-center',
        'flex',
        'justify-center',
        'items-center',
        'aspect-card',
        cardWidths[size],
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
      onMouseEnter={(e) => preview.show(card, e.clientX, reveal)}
      onMouseLeave={() => preview.hide(instanceId)}
    >
      <CardArt
        cardRef={card.ref}
        faceIndex={card.faceIndex}
        faceDown={hidden}
      />
      {card.isCommander && (
        <span
          data-testid="commander-badge"
          title="Commander"
          className="pointer-events-none absolute left-1 top-1 rounded-full bg-slate-900/80 px-1 text-xs leading-5 text-amber-300"
        >
          ♛
        </span>
      )}
      {(card.zone === 'battlefield' || card.zone === 'exile') && (
        <CardBadges card={card} />
      )}
    </div>
  );
};

export default Card;
