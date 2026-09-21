import type { CardView, Position } from '@shared/game';

import { moveTo } from '../common/cardMenus';
import { dispatch } from '../viewStore';
import { dropZoneAt } from './dropZones';

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

const clamp = (value: number, max: number) =>
  Math.max(0, Math.min(value, Math.max(0, max)));

// Where a card dropped at a screen point lands, in logical field units.
// The grab point (in unscaled card px) stays under the pointer, and the
// card is kept inside the field. offsetX is how far the field's contents
// are shifted right of its own left edge, so a position means the same
// thing as the one already on a card. Null when the point is off the
// field.
export const fieldDropPosition = ({
  pointer,
  grab,
  field,
  scale,
  fieldSize,
  cardSize,
  offsetX = 0,
}: {
  pointer: Position;
  grab: Position;
  field: Rect;
  scale: number;
  fieldSize: Size;
  cardSize: Size;
  offsetX?: number;
}): Position | null => {
  const inside =
    pointer.x >= field.left &&
    pointer.x <= field.right &&
    pointer.y >= field.top &&
    pointer.y <= field.bottom;
  if (!inside || scale <= 0) return null;
  return {
    x: Math.round(
      clamp(
        (pointer.x - field.left) / scale - grab.x - offsetX,
        fieldSize.width - offsetX - cardSize.width
      )
    ),
    y: Math.round(
      clamp(
        (pointer.y - field.top) / scale - grab.y,
        fieldSize.height - cardSize.height
      )
    ),
  };
};

// A hand card dragged out of the docked tray: onto a zone pile it moves
// there, onto the battlefield it enters where it was dropped, and
// anywhere else (the tray included) it stays in hand.
export const dropHandCard = (
  card: CardView,
  pointer: Position,
  grab: Position,
  cardSize: Size
) => {
  const zone = dropZoneAt(pointer.x, pointer.y);
  if (zone === 'hand') return;
  if (zone) {
    if (zone === 'command' && !card.isCommander) return;
    moveTo(card, zone, zone === 'library' ? 0 : undefined);
    return;
  }
  const field = document.querySelector<HTMLElement>(
    '[data-testid="battlefield"]'
  );
  if (!field) return;
  const position = fieldDropPosition({
    pointer,
    grab,
    field: field.getBoundingClientRect(),
    scale: Number(field.dataset.scale) || 1,
    fieldSize: { width: field.clientWidth, height: field.clientHeight },
    cardSize,
    offsetX: Number(field.dataset.offsetX) || 0,
  });
  if (!position) return;
  dispatch({
    type: 'moveCard',
    instanceId: card.instanceId,
    to: 'battlefield',
    position,
  });
};
