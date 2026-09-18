import type { CardRow } from '@shared/types/cards';
import { describe, expect, it } from 'vitest';

import { toCardRef } from './cardRef';

const row: CardRow = {
  name: 'Grizzly Bears',
  uuid: 'mtgjson-uuid',
  scryfallId: '409f9b88-f03e-40b6-9883-68c14c37c0de',
  setCode: '10E',
  number: '268',
  power: '2',
  toughness: '2',
  type: 'Creature — Bear',
  types: 'Creature',
  keywords: null,
  life: null,
  loyalty: null,
};

describe('toCardRef', () => {
  it('copies display data and keys the ref by Scryfall id', () => {
    expect(toCardRef(row)).toEqual({
      id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
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

  it('omits missing stats so the ref stays plain JSON', () => {
    const ref = toCardRef({
      ...row,
      name: 'Forest',
      type: 'Basic Land — Forest',
      power: null,
      toughness: null,
    });
    expect(ref).not.toHaveProperty('power');
    expect(ref.faces[0]).not.toHaveProperty('toughness');
    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref);
  });
});
