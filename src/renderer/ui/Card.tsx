import type CardModel from '@shared/models/CardModel';
import classNames from 'classnames';
import { MouseEvent, useRef, useState } from 'react';
import Draggable, { DraggableEventHandler } from 'react-draggable';

import CardImg from './CardImg';
import { useContextMenu } from './ContextMenuProvider';
import { ContextMenuSpec } from './ContextMenuStore';

type CardLocation = 'battlefield' | 'graveyard' | 'hand';

interface Props {
  card: CardModel;
  location: CardLocation;
  draggable?: boolean;
  tappable?: boolean;
  playable?: boolean;
  onPlayed?(card: CardModel): void;
  onMoved?(card: CardModel): void;
  onDestroy?(card: CardModel): void;
  onExile?(card: CardModel): void;
}

const Card = ({
  card,
  draggable = true,
  tappable = true,
  playable = false,
  onPlayed,
  onMoved,
  onDestroy,
  onExile,
  location,
}: Props) => {
  const menu = useContextMenu();
  const [tapped, setTapped] = useState(false);
  // react-draggable needs a ref to its child since React 19 removed
  // findDOMNode, which it otherwise falls back to.
  const nodeRef = useRef<HTMLDivElement>(null);

  const [lastPosition, setLastPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const toggleTapped = () => {
    setTapped(!tapped);
  };

  const handleClick = () => {
    if (tappable && !playable) {
      toggleTapped();
    } else if (playable) {
      onPlayed?.(card);
    }
  };

  const onDragStart: DraggableEventHandler = (_event, data) => {
    setLastPosition({ x: data.lastX, y: data.lastY });
  };

  const onDragStop: DraggableEventHandler = (_event, data) => {
    const start = lastPosition ?? { x: data.x, y: data.y };
    const dX = Math.abs(data.x - start.x);
    const dY = Math.abs(data.y - start.y);

    // count small movements as intended clicks
    if (dX <= 2 && dY <= 2) {
      handleClick();
    } else {
      onMoved?.(card);
    }

    setLastPosition(null);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const specs: (ContextMenuSpec | false)[] = [
      location !== 'graveyard' &&
        !!onDestroy && {
          title: 'Destroy',
          action: () => onDestroy(card),
        },
      !!onExile && { title: 'Exile', action: () => onExile(card) },
      location === 'graveyard' && {
        title: 'Return to battlefield',
        action: () => {
          /* todo */
        },
      },
      location !== 'hand' && {
        title: 'Return to hand',
        action: () => {
          /* todo */
        },
      },
    ];

    menu.open({
      specs: specs.filter((spec): spec is ContextMenuSpec => Boolean(spec)),
      x: e.pageX,
      y: e.pageY,
    });
  };

  // react-draggable's user-select hack injects a <style> tag, which the
  // CSP blocks, so text selection is disabled with a class instead.
  return (
    <div className="relative select-none">
      <Draggable
        nodeRef={nodeRef}
        onStart={onDragStart}
        onStop={onDragStop}
        disabled={!draggable}
        handle=".handle"
        enableUserSelectHack={false}
      >
        <div
          ref={nodeRef}
          data-testid="card"
          className={classNames({ absolute: draggable })}
          onClick={draggable ? undefined : handleClick}
          onContextMenu={handleContextMenu}
        >
          <div
            className={classNames(
              'origin-center',
              'flex',
              'justify-center',
              'items-center',
              'aspect-card',
              'w-52',
              'handle',
              'ring-amber-300',
              'rounded-lg',
              'hover:cursor-pointer',
              {
                absolute: draggable,
                'rotate-90': tapped,
                'hover:ring-4': draggable || tappable || onPlayed,
              }
            )}
          >
            <CardImg scryfallId={card.scryfallId} name={card.name} />
          </div>
        </div>
      </Draggable>
      {lastPosition && (
        <div
          className={classNames(
            'absolute',
            'origin-center',
            'flex',
            'justify-center',
            'items-center',
            'aspect-card',
            'w-52',
            'z-0',
            'opacity-50'
          )}
          style={{
            transform: `translate(${lastPosition.x}px, ${lastPosition.y}px)`,
          }}
        >
          <div
            className={classNames({
              'rotate-90': tapped,
            })}
          >
            <CardImg scryfallId={card.scryfallId} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Card;
