import type { Position } from '@shared/game';

// The board's right-hand panel (life, tools, zone piles), in px.
export const SIDE_PANEL_WIDTH = 320;

// The battlefield's logical height. Card positions are in these units, and
// a shorter field (e.g. half a board shared with an opponent) scales down,
// so positions mean the same thing on every screen and to every peer.
export const FIELD_HEIGHT = 640;

// The narrower panel beside each opponent in a pod of three or four.
export const POD_PANEL_WIDTH = 184;

// Logical width that holds every card of a battlefield, so a narrow
// opponent field can shrink to show all of it. A tapped md card is about
// 224 units wide.
const CARD_EXTENT = 230;
const MIN_FIT_WIDTH = 640;

export const fieldWidth = (cards: { position: Position | null }[]) =>
  Math.max(
    MIN_FIT_WIDTH,
    ...cards.map((card) => (card.position?.x ?? 0) + CARD_EXTENT)
  );

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
