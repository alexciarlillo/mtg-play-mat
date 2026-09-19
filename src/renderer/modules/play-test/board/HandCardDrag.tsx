import type { CardView, Position } from '@shared/game';
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import CardArt from '../../../ui/CardArt';
import { useCardPreview } from '../../../ui/CardPreview';
import { dropHandCard } from './handDrop';

// Movement under this many pixels is a click (play), not a drag.
const DRAG_SLOP = 4;

interface Drag {
  pointerId: number;
  start: Position;
  // Where in the card it was picked up, and the card's size.
  grab: Position;
  size: { width: number; height: number };
  at: Position | null;
}

// Makes a card in the docked hand draggable onto the board. The card
// stays in the tray while a copy follows the pointer, since the tray
// scrolls and would clip the card itself.
const HandCardDrag = ({
  card,
  children,
}: {
  card: CardView;
  children: ReactNode;
}) => {
  const preview = useCardPreview();
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag ends in a click on the card, which would otherwise play it.
  const dragged = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      grab: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      size: {
        width: e.currentTarget.offsetWidth,
        height: e.currentTarget.offsetHeight,
      },
      at: null,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved =
      Math.abs(e.clientX - drag.start.x) > DRAG_SLOP ||
      Math.abs(e.clientY - drag.start.y) > DRAG_SLOP;
    if (!drag.at && !moved) return;
    // Capturing on press would retarget the click to this wrapper, so
    // the card's own click (play) would never fire.
    if (!drag.at) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      preview.hide(card.instanceId);
    }
    setDrag({ ...drag, at: { x: e.clientX, y: e.clientY } });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.at) return;
    dragged.current = true;
    dropHandCard(card, { x: e.clientX, y: e.clientY }, drag.grab, drag.size);
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.stopPropagation();
  };

  return (
    <div
      data-testid="hand-card-drag"
      className="touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onClickCapture={onClickCapture}
    >
      {children}
      {drag?.at &&
        createPortal(
          <div
            data-testid="hand-drag-ghost"
            className="pointer-events-none fixed z-50 opacity-80"
            style={{
              left: drag.at.x - drag.grab.x,
              top: drag.at.y - drag.grab.y,
              width: drag.size.width,
              height: drag.size.height,
            }}
          >
            <CardArt
              cardRef={card.ref}
              faceIndex={card.faceIndex}
              faceDown={false}
            />
          </div>,
          document.body
        )}
    </div>
  );
};

export default HandCardDrag;
