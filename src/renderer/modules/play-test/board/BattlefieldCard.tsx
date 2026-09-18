import type { CardView, Position } from '@shared/game';
import classNames from 'classnames';
import { useRef, useState } from 'react';
import Draggable, { type DraggableEventHandler } from 'react-draggable';

import Card from '../../../ui/Card';
import CardImg from '../../../ui/CardImg';
import { dispatch } from '../viewStore';

const ORIGIN: Position = { x: 0, y: 0 };

// Movement under this many pixels is a click (tap), not a drag.
const CLICK_SLOP = 2;

const BattlefieldCard = ({ card }: { card: CardView }) => {
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

  const handleStop: DraggableEventHandler = (_event, data) => {
    setDragging(false);
    const at = { x: Math.round(data.x), y: Math.round(data.y) };

    if (
      Math.abs(at.x - position.x) <= CLICK_SLOP &&
      Math.abs(at.y - position.y) <= CLICK_SLOP
    ) {
      dispatch({ type: 'toggleTap', instanceId: card.instanceId });
      return;
    }

    setDrop({ from: card, at });
    dispatch({
      type: 'setPosition',
      instanceId: card.instanceId,
      position: at,
    });
  };

  const menu = [
    {
      title: 'Destroy',
      action: () =>
        dispatch({
          type: 'moveCard',
          instanceId: card.instanceId,
          to: 'graveyard',
        }),
    },
  ];

  return (
    <>
      {dragging && (
        <div
          className="absolute left-0 top-0 aspect-card w-52 opacity-50 pointer-events-none"
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
        bounds="parent"
        handle=".handle"
        onDrag={handleDrag}
        onStop={handleStop}
        enableUserSelectHack={false}
      >
        <div
          ref={nodeRef}
          data-testid="battlefield-card"
          className={classNames('absolute left-0 top-0', {
            'z-10': dragging,
          })}
        >
          <Card card={card} menu={menu} />
        </div>
      </Draggable>
    </>
  );
};

export default BattlefieldCard;
