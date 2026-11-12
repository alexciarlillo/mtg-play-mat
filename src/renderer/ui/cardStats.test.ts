import type { CardView } from '@shared/game';
import { describe, expect, it } from 'vitest';

import {
  counterPtLabel,
  loyalty,
  otherCounters,
  powerToughness,
} from './cardStats';

const base: CardView = {
  instanceId: 'p1:1',
  ref: {
    id: 'x',
    name: 'Delver of Secrets // Insectile Aberration',
    typeLine: 'Creature // Creature',
    layout: 'transform',
    faces: [
      {
        name: 'Delver of Secrets',
        typeLine: 'Creature',
        power: '1',
        toughness: '1',
      },
      {
        name: 'Insectile Aberration',
        typeLine: 'Creature',
        power: '3',
        toughness: '2',
      },
    ],
  },
  owner: 'p1',
  controller: 'p1',
  zone: 'battlefield',
  position: { x: 0, y: 0 },
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
};

describe('powerToughness', () => {
  it('is hidden until counters change the printed stats', () => {
    expect(powerToughness(base)).toBeNull();
    expect(powerToughness({ ...base, counters: { '+1/+1': 2 } })).toBe('3/3');
  });

  it('uses the current face', () => {
    expect(
      powerToughness({ ...base, faceIndex: 1, counters: { '-1/-1': 1 } })
    ).toBe('2/1');
  });

  it('is always 2/2 (plus counters) face down', () => {
    expect(powerToughness({ ...base, ref: null, faceDown: true })).toBe('2/2');
    expect(
      powerToughness({
        ...base,
        ref: null,
        faceDown: true,
        counters: { '+1/+1': 1 },
      })
    ).toBe('3/3');
  });

  it('keeps non-numeric stats readable', () => {
    const star: CardView = {
      ...base,
      ref: { ...base.ref!, faces: [], power: '*', toughness: '1+*' },
      counters: { '+1/+1': 1 },
    };
    expect(powerToughness(star)).toBe('*+1/1+*+1');
  });
});

describe('P/T counters of any kind', () => {
  it('adds +1/+0 and +0/+1 counters to one side each', () => {
    const card = { ...base, counters: { '+1/+0': 2, '+0/+1': 1 } };
    expect(powerToughness(card)).toBe('3/2');
    expect(counterPtLabel(card)).toBe('+2/+1');
  });

  it('labels only the counters on top of a set base', () => {
    const card = {
      ...base,
      ptOverride: { power: 4, toughness: 4 },
      counters: { '+1/+1': 1, '-1/-1': 0, charge: 3 },
    };
    expect(powerToughness(card)).toBe('5/5');
    expect(counterPtLabel(card)).toBe('+1/+1');
    expect(counterPtLabel(base)).toBeNull();
  });
});

describe('loyalty', () => {
  const jace: CardView = {
    ...base,
    ref: {
      id: 'j',
      name: 'Jace',
      typeLine: 'Legendary Planeswalker — Jace',
      faces: [{ name: 'Jace', typeLine: 'Legendary Planeswalker — Jace' }],
      loyalty: '3',
    },
    counters: { loyalty: 4, shield: 1 },
  };

  it('reads the loyalty counters of a planeswalker', () => {
    expect(loyalty(jace)).toBe(4);
    expect(otherCounters(jace)).toEqual([['shield', 1]]);
  });

  it('is null for other cards, which show loyalty as a plain chip', () => {
    const creature = { ...base, counters: { loyalty: 1 } };
    expect(loyalty(creature)).toBeNull();
    expect(otherCounters(creature)).toEqual([['loyalty', 1]]);
  });
});
