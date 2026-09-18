import type { Printing } from '@shared/types/cards';
import { describe, expect, it } from 'vitest';

import { toCardRef } from './cardRef';

const printing: Printing = {
  id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
  oracleId: 'oracle',
  name: 'Grizzly Bears',
  lang: 'en',
  setCode: '10e',
  setName: 'Tenth Edition',
  collectorNumber: '268',
  releasedAt: '2007-07-13',
  layout: 'normal',
  typeLine: 'Creature — Bear',
  manaCost: '{1}{G}',
  cmc: 2,
  colors: ['G'],
  colorIdentity: ['G'],
  power: '2',
  toughness: '2',
  loyalty: null,
  defense: null,
  keywords: [],
  oracleText: null,
  rarity: 'common',
  digital: false,
  faces: [
    {
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
      image: 'https://cards.scryfall.io/normal/front/4/0/x.jpg',
    },
  ],
};

describe('toCardRef', () => {
  it('copies display data and keys the ref by Scryfall id', () => {
    expect(toCardRef(printing)).toEqual({
      id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
      layout: 'normal',
      faces: [
        {
          name: 'Grizzly Bears',
          typeLine: 'Creature — Bear',
          power: '2',
          toughness: '2',
        },
      ],
    });
  });

  it('keeps every face of a double-faced card', () => {
    const ref = toCardRef({
      ...printing,
      name: 'Delver of Secrets // Insectile Aberration',
      typeLine: 'Creature — Human Wizard // Creature — Human Insect',
      power: '1',
      toughness: '1',
      faces: [
        {
          name: 'Delver of Secrets',
          typeLine: 'Creature — Human Wizard',
          power: '1',
          toughness: '1',
        },
        {
          name: 'Insectile Aberration',
          typeLine: 'Creature — Human Insect',
          power: '3',
          toughness: '2',
        },
      ],
    });
    expect(ref.faces.map((f) => f.name)).toEqual([
      'Delver of Secrets',
      'Insectile Aberration',
    ]);
    expect(ref.faces[1]).toMatchObject({ power: '3', toughness: '2' });
  });

  it('omits missing stats so the ref stays plain JSON', () => {
    const ref = toCardRef({
      ...printing,
      name: 'Forest',
      typeLine: 'Basic Land — Forest',
      power: null,
      toughness: null,
      faces: [{ name: 'Forest', typeLine: 'Basic Land — Forest' }],
    });
    expect(ref).not.toHaveProperty('power');
    expect(ref.faces[0]).not.toHaveProperty('toughness');
    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref);
  });
});
