import { describe, expect, it } from 'vitest';

import { fieldBounds, stackOrder } from './layout';

const card = (instanceId: string, attachedTo: string | null = null) => ({
  instanceId,
  attachedTo,
});

const ids = (cards: { instanceId: string }[]) => cards.map((c) => c.instanceId);

const at = (x: number) => ({ position: { x, y: 0 } });

describe('fieldBounds', () => {
  it('reserves room left of x for a turned card', () => {
    expect(fieldBounds([at(0)])).toEqual({ offsetX: 32, width: 640 });
  });

  it('grows with the rightmost card and its left reserve', () => {
    expect(fieldBounds([at(0), at(1000)])).toEqual({
      offsetX: 32,
      width: 1262,
    });
  });

  it('brings a card left of the origin back into view', () => {
    expect(fieldBounds([at(-100), at(600)])).toEqual({
      offsetX: 132,
      width: 962,
    });
  });

  it('falls back to the minimum width for an empty field', () => {
    expect(fieldBounds([])).toEqual({ offsetX: 32, width: 640 });
    expect(fieldBounds([{ position: null }])).toEqual({
      offsetX: 32,
      width: 640,
    });
  });
});

describe('stackOrder', () => {
  it('draws attachments before their host, newest furthest back', () => {
    expect(
      ids(
        stackOrder([
          card('a'),
          card('host'),
          card('b'),
          card('aura', 'host'),
          card('gear', 'host'),
          card('on-aura', 'aura'),
        ])
      )
    ).toEqual(['a', 'gear', 'on-aura', 'aura', 'host', 'b']);
  });

  it('keeps orphans and loops instead of dropping them', () => {
    expect(ids(stackOrder([card('x', 'gone'), card('y')]))).toEqual(['x', 'y']);
    expect(ids(stackOrder([card('p', 'q'), card('q', 'p')])).sort()).toEqual([
      'p',
      'q',
    ]);
  });
});
