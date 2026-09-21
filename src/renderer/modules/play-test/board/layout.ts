import type { Position } from '@shared/game';

// The board's right-hand panel (life, tools, zone piles), in px.
export const SIDE_PANEL_WIDTH = 320;

// The battlefield's logical height. Card positions are in these units, and
// a shorter field (e.g. half a board shared with an opponent) scales down,
// so positions mean the same thing on every screen and to every peer.
export const FIELD_HEIGHT = 640;

// The narrower panel beside each opponent in a pod of three or four.
export const POD_PANEL_WIDTH = 184;

// Share of the board the row of opponents takes, by seat count. A field
// scales to fit its width and never past a square, so the more seats
// split the row the less of the height they can use, and a pod hands the
// rest to the local field instead of holding on to half.
const ROW_HEIGHTS = ['50%', '50%', '35%'];

// A seat's panel is the tallest thing in the row, so the row keeps its
// height even when a tall hand tray leaves little board — short of
// taking more than its share of what is left.
const POD_ROW_MIN_HEIGHT = 'min(320px, 60%)';

export const opponentRowHeight = (
  seats: number
): { height: string; minHeight?: string } => ({
  height: ROW_HEIGHTS[Math.min(seats, ROW_HEIGHTS.length) - 1],
  minHeight: seats > 1 ? POD_ROW_MIN_HEIGHT : undefined,
});

// Logical width that holds every card of a battlefield, so a narrow
// opponent field can shrink to show all of it. A tapped md card is about
// 224 units wide.
const CARD_EXTENT = 230;
const MIN_FIT_WIDTH = 640;

// A tapped card turns about its centre, so its box reaches this far left
// of the card's own x. Reserving it keeps a tapped card at x = 0 inside
// the field instead of over the edge of the window.
const TAP_EXTENT = 32;

export interface FieldBounds {
  // Logical units the field's contents shift right by, so that the
  // leftmost card's turned box starts at the field's own left edge.
  offsetX: number;
  width: number;
}

export const fieldBounds = (
  cards: { position: Position | null }[]
): FieldBounds => {
  const xs = cards.map((card) => card.position?.x ?? 0);
  const offsetX = TAP_EXTENT - Math.min(0, ...xs);
  return {
    offsetX,
    width: Math.max(MIN_FIT_WIDTH, offsetX + Math.max(0, ...xs) + CARD_EXTENT),
  };
};

export const fieldScale = (height: number) =>
  height > 0 ? Math.min(1, height / FIELD_HEIGHT) : 1;

// Draw order for a battlefield: attachments just before their host, the
// newest (which peeks out furthest) at the back. Orphans keep their place,
// and anything a malformed loop would drop is drawn last.
export const stackOrder = <
  C extends { instanceId: string; attachedTo: string | null },
>(
  cards: readonly C[]
): C[] => {
  const ids = new Set(cards.map((card) => card.instanceId));
  const attached = new Map<string, C[]>();
  const roots: C[] = [];
  cards.forEach((card) => {
    if (card.attachedTo && ids.has(card.attachedTo)) {
      attached.set(card.attachedTo, [
        ...(attached.get(card.attachedTo) ?? []),
        card,
      ]);
    } else {
      roots.push(card);
    }
  });

  const out: C[] = [];
  const seen = new Set<string>();
  const visit = (card: C) => {
    if (seen.has(card.instanceId)) return;
    seen.add(card.instanceId);
    [...(attached.get(card.instanceId) ?? [])].reverse().forEach(visit);
    out.push(card);
  };
  roots.forEach(visit);
  cards.forEach(visit);
  return out;
};
