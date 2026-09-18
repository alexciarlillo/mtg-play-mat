import { describe, expect, it } from 'vitest';

import { stackOrder } from './layout';

const card = (instanceId: string, attachedTo: string | null = null) => ({
  instanceId,
  attachedTo,
});

const ids = (cards: { instanceId: string }[]) => cards.map((c) => c.instanceId);

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
