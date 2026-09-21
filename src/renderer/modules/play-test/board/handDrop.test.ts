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
