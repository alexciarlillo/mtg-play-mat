import type { Position } from '@shared/game';

// The player panel, and an opponent panel outside a pod, at their full
// width in px. Both hold life, counters, zone piles and the command zone.
export const FULL_PANEL_WIDTH = 320;

// The battlefield's logical height. Card positions are in these units, and
// a field of another height scales to it, so positions mean the same thing
// on every screen and to every peer.
export const FIELD_HEIGHT = 640;

// How far a tall field grows its cards and mat, so a big window is used
// rather than left as bare table, without cards getting silly.
export const MAX_FIELD_SCALE = 1.5;

// The play area background, in the same logical units as the cards: the
// shape of a real 24x14 inch playmat, anchored at the field's origin. It
// scales with the cards, so a card dropped on a patch of art stays on
// that patch at every window size and on every screen in the pod.
export const MAT_HEIGHT = FIELD_HEIGHT;
export const MAT_WIDTH = Math.round((FIELD_HEIGHT * 24) / 14);

// The narrower opponent panel used in a pod of three or four.
export const POD_PANEL_WIDTH = 184;

// A duel's opponent panel shorter than this cannot hold card-sized zone
// piles and a command zone at once, so its counts drop to the pod's
// name-and-count tiles rather than under a fold.
export const TIGHT_PANEL_HEIGHT = 300;

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
  height > 0 ? Math.min(MAX_FIELD_SCALE, height / FIELD_HEIGHT) : 1;

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
