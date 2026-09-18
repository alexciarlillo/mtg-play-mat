// The board's right-hand panel (life, tools, zone piles), in px.
export const SIDE_PANEL_WIDTH = 320;

// The battlefield's logical height. Card positions are in these units, and
// a shorter field (e.g. half a board shared with an opponent) scales down,
// so positions mean the same thing on every screen and to every peer.
export const FIELD_HEIGHT = 640;

export const fieldScale = (height: number) =>
  height > 0 ? Math.min(1, height / FIELD_HEIGHT) : 1;
