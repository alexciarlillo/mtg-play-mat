import type { CardView, Position } from '@shared/game';
import classNames from 'classnames';
import { useRef, useState } from 'react';
import Draggable, {
  type DraggableEvent,
  type DraggableEventHandler,
} from 'react-draggable';

import Card from '../../../ui/Card';
import { cardWidths } from '../../../ui/cardSizes';
import CardImg from '../../../ui/CardImg';
import { moveMenu, moveTo } from '../common/cardMenus';
import { dispatch } from '../viewStore';
import { dropZoneAt } from './dropZones';

const ORIGIN: Position = { x: 0, y: 0 };

// Movement under this many pixels is a click (tap), not a drag.
const CLICK_SLOP = 2;

const pointOf = (e: DraggableEvent) => {
  const point = 'changedTouches' in e ? e.changedTouches[0] : e;
  return { x: point.clientX, y: point.clientY };
};

const clamp = (value: number, max: number) =>
  Math.max(0, Math.min(value, Math.max(0, max)));

interface Props {
  card: CardView;
  // The field's CSS scale, so drags track the pointer when it is shrunk.
  scale?: number;
}

const BattlefieldCard = ({ card, scale = 1 }: Props) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Holds the drop point until main's next view of this card arrives, so
  // the card doesn't snap back for a frame while the action round-trips.
  const [drop, setDrop] = useState<{ from: CardView; at: Position } | null>(
    null
  );

  const home = card.position ?? ORIGIN;
  const position = drop?.from === card ? drop.at : home;

  const handleDrag = () => {
    if (!dragging) setDragging(true);
  };

  const handleStop: DraggableEventHandler = (event, data) => {
    setDragging(false);
    const at = { x: Math.round(data.x), y: Math.round(data.y) };

    if (
      Math.abs(at.x - position.x) <= CLICK_SLOP &&
      Math.abs(at.y - position.y) <= CLICK_SLOP
    ) {
      dispatch({ type: 'toggleTap', instanceId: card.instanceId });
      return;
    }

    const pointer = pointOf(event);
    const target = dropZoneAt(pointer.x, pointer.y);
    // Only commanders belong in the command zone.
    const zone = target === 'command' && !card.isCommander ? null : target;
    if (zone) {
      setDrop({ from: card, at });
      moveTo(card, zone, zone === 'library' ? 0 : undefined);
      return;
    }

    // Drags are unbounded so cards can reach the zone piles; a drop
    // anywhere else lands back inside the battlefield.
    const node = nodeRef.current;
    const field = node?.parentElement;
    const inside =
      node && field
        ? {
            x: clamp(at.x, field.clientWidth - node.offsetWidth),
            y: clamp(at.y, field.clientHeight - node.offsetHeight),
          }
        : at;

    setDrop({ from: card, at: inside });
    dispatch({
      type: 'setPosition',
      instanceId: card.instanceId,
      position: inside,
    });
  };

  const menu = [
    {
      title: card.tapped ? 'Untap' : 'Tap',
      action: () =>
        dispatch({ type: 'toggleTap', instanceId: card.instanceId }),
    },
    ...moveMenu(card),
  ];

  return (
    <>
      {dragging && (
        <div
          className={classNames(
            'absolute left-0 top-0 aspect-card opacity-50 pointer-events-none',
            cardWidths.md
          )}
          style={{ transform: `translate(${home.x}px, ${home.y}px)` }}
        >
          <div className={classNames('h-full', { 'rotate-90': card.tapped })}>
            <CardImg scryfallId={card.ref?.id} />
          </div>
        </div>
      )}
      <Draggable
        nodeRef={nodeRef}
        position={position}
        scale={scale}
        handle=".handle"
        onDrag={handleDrag}
        onStop={handleStop}
        enableUserSelectHack={false}
      >
        <div
          ref={nodeRef}
          data-testid="battlefield-card"
          className={classNames('absolute left-0 top-0', {
            'z-20': dragging,
          })}
        >
          <Card card={card} menu={menu} size="md" />
        </div>
      </Draggable>
    </>
  );
};

export default BattlefieldCard;
