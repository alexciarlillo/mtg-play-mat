export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// How far the panel can travel along one axis, keeping a margin at both
// edges; zero when it doesn't fit, which pins it to the near edge.
const travel = (room: number, panel: number, margin: number) =>
  Math.max(0, room - panel - 2 * margin);

// The panel's top-left offset for a placement given as fractions of its
// travel, so the same placement fits any room size.
export const offsetFor = (
  placement: Point,
  room: Size,
  panel: Size,
  margin: number
): Point => ({
  x:
    margin + clamp(placement.x, 0, 1) * travel(room.width, panel.width, margin),
  y:
    margin +
    clamp(placement.y, 0, 1) * travel(room.height, panel.height, margin),
});

// Keeps a dragged offset inside the room.
export const clampOffset = (
  offset: Point,
  room: Size,
  panel: Size,
  margin: number
): Point => ({
  x:
    margin +
    clamp(offset.x - margin, 0, travel(room.width, panel.width, margin)),
  y:
    margin +
    clamp(offset.y - margin, 0, travel(room.height, panel.height, margin)),
});

const toFraction = (
  offset: number,
  room: number,
  panel: number,
  margin: number,
  fallback: number
) => {
  const span = travel(room, panel, margin);
  if (span === 0) return fallback;
  // Four places is well under a pixel and keeps the settings file tidy.
  return Math.round(clamp((offset - margin) / span, 0, 1) * 1e4) / 1e4;
};

// The inverse of offsetFor. An axis with no room to move keeps the
// previous fraction rather than collapsing to the edge.
export const placementFor = (
  offset: Point,
  room: Size,
  panel: Size,
  margin: number,
  previous: Point
): Point => ({
  x: toFraction(offset.x, room.width, panel.width, margin, previous.x),
  y: toFraction(offset.y, room.height, panel.height, margin, previous.y),
});
