import { describe, expect, it } from 'vitest';

import { clampOffset, offsetFor, placementFor } from './panelGeometry';

const room = { width: 1000, height: 600 };
const panel = { width: 300, height: 200 };
const M = 10;

describe('offsetFor', () => {
  it('maps fractions onto the room left after the panel and margins', () => {
    expect(offsetFor({ x: 0, y: 0 }, room, panel, M)).toEqual({
      x: 10,
      y: 10,
    });
    expect(offsetFor({ x: 1, y: 1 }, room, panel, M)).toEqual({
      x: 690,
      y: 390,
    });
    expect(offsetFor({ x: 0.5, y: 0.5 }, room, panel, M)).toEqual({
      x: 350,
      y: 200,
    });
  });

  it('keeps a corner as the room resizes', () => {
    const small = { width: 500, height: 300 };
    expect(offsetFor({ x: 1, y: 1 }, small, panel, M)).toEqual({
      x: 190,
      y: 90,
    });
  });

  it('clamps out-of-range fractions', () => {
    expect(offsetFor({ x: -1, y: 4 }, room, panel, M)).toEqual({
      x: 10,
      y: 390,
    });
  });

  it('pins to the near edge when the panel does not fit', () => {
    const tiny = { width: 200, height: 100 };
    expect(offsetFor({ x: 1, y: 1 }, tiny, panel, M)).toEqual({
      x: 10,
      y: 10,
    });
  });
});

describe('clampOffset', () => {
  it('leaves an offset inside the room alone', () => {
    expect(clampOffset({ x: 100, y: 50 }, room, panel, M)).toEqual({
      x: 100,
      y: 50,
    });
  });

  it('stops at every edge, inside the margin', () => {
    expect(clampOffset({ x: -50, y: -5 }, room, panel, M)).toEqual({
      x: 10,
      y: 10,
    });
    expect(clampOffset({ x: 5000, y: 5000 }, room, panel, M)).toEqual({
      x: 690,
      y: 390,
    });
  });

  it('pins to the margin when the panel is bigger than the room', () => {
    const tiny = { width: 200, height: 100 };
    expect(clampOffset({ x: 80, y: 80 }, tiny, panel, M)).toEqual({
      x: 10,
      y: 10,
    });
  });
});

describe('placementFor', () => {
  it('inverts offsetFor', () => {
    const at = offsetFor({ x: 0.25, y: 0.75 }, room, panel, M);
    expect(placementFor(at, room, panel, M, { x: 1, y: 1 })).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });

  it('clamps and rounds', () => {
    expect(
      placementFor({ x: 9999, y: 123.4567 }, room, panel, M, { x: 0, y: 0 })
    ).toEqual({ x: 1, y: 0.2986 });
  });

  it('keeps the previous fraction on an axis with no room', () => {
    const narrow = { width: 300, height: 600 };
    expect(
      placementFor({ x: 10, y: 10 }, narrow, panel, M, { x: 0.7, y: 0.7 })
    ).toEqual({ x: 0.7, y: 0 });
  });
});
