// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fieldDropPosition } from './handDrop';

const field = { left: 100, top: 50, right: 900, bottom: 650 };
const at = {
  field,
  scale: 1,
  fieldSize: { width: 800, height: 600 },
  cardSize: { width: 160, height: 224 },
};

// The card is drawn at the field's left edge, plus what the field
// reserves for a turned card, plus the position it is given.
const drawnAt = (x: number, offsetX: number) => field.left + offsetX + x;

describe('fieldDropPosition', () => {
  it('leaves the grab point under the pointer whatever is reserved', () => {
    const pointer = { x: 400, y: 300 };
    const grab = { x: 80, y: 112 };
    for (const offsetX of [0, 32]) {
      const drop = fieldDropPosition({ ...at, pointer, grab, offsetX });
      expect(drop).not.toBeNull();
      expect(drawnAt(drop!.x, offsetX) + grab.x).toBe(pointer.x);
      expect(field.top + drop!.y + grab.y).toBe(pointer.y);
    }
  });

  it('keeps a card inside a field that reserves room on its left', () => {
    const grab = { x: 0, y: 0 };
    const left = fieldDropPosition({
      ...at,
      pointer: { x: field.left, y: field.top },
      grab,
      offsetX: 32,
    });
    expect(left?.x).toBe(0);
    const right = fieldDropPosition({
      ...at,
      pointer: { x: field.right, y: field.bottom },
      grab,
      offsetX: 32,
    });
    // The far edge is the field's width less the reserve, so a turned
    // card at the edge overhangs by what the left reserved for it.
    expect(right?.x).toBe(800 - 32 - 160);
    expect(right?.y).toBe(600 - 224);
  });

  it('drops nothing outside the field', () => {
    expect(
      fieldDropPosition({
        ...at,
        pointer: { x: field.right + 1, y: 300 },
        grab: { x: 0, y: 0 },
      })
    ).toBeNull();
  });
});

// The player panel now makes the field scale to fit its cards, so the
// same screen box is a different number of logical units at each scale.
const scaled = (scale: number) => ({
  field,
  scale,
  fieldSize: { width: 800 / scale, height: 600 / scale },
  cardSize: { width: 160, height: 224 },
});

// Where the dropped card's left edge is drawn on screen.
const screenLeft = (x: number, offsetX: number, scale: number) =>
  field.left + (offsetX + x) * scale;

describe('fieldDropPosition under a scaled field', () => {
  const offsetX = 32;
  const grab = { x: 80, y: 112 };
  const pointer = { x: 520, y: 400 };

  it('holds the grab point under the pointer at every scale', () => {
    for (const scale of [1.5, 1, 0.75, 0.5, 0.31]) {
      const drop = fieldDropPosition({
        ...scaled(scale),
        pointer,
        grab,
        offsetX,
      });
      expect(drop).not.toBeNull();
      // A logical unit is rounded, so the card can sit half a unit off.
      expect(
        screenLeft(drop!.x, offsetX, scale) + grab.x * scale - pointer.x
      ).toBeLessThanOrEqual(scale);
      expect(
        field.top + (drop!.y + grab.y) * scale - pointer.y
      ).toBeLessThanOrEqual(scale);
    }
  });

  it('lands under the pointer again once a resize has rescaled it', () => {
    const before = fieldDropPosition({ ...scaled(1), pointer, grab, offsetX });
    const after = fieldDropPosition({ ...scaled(0.4), pointer, grab, offsetX });
    // The same point on screen is a different position on a rescaled
    // field, and both still land the grab point under the pointer.
    expect(after!.x).not.toBe(before!.x);
    expect(screenLeft(after!.x, offsetX, 0.4) + grab.x * 0.4).toBeCloseTo(
      pointer.x,
      0
    );
  });

  it('keeps a card off the player panel at every scale', () => {
    for (const scale of [1, 0.6, 0.35]) {
      const drop = fieldDropPosition({
        ...scaled(scale),
        pointer: { x: field.right, y: field.bottom },
        grab: { x: 0, y: 0 },
        offsetX,
      });
      const right = screenLeft(drop!.x, offsetX, scale) + 160 * scale;
      expect(right).toBeLessThanOrEqual(field.right);
    }
  });
});
