import type { TokenSearchResult } from '@shared/types/cards';
import { describe, expect, it } from 'vitest';

import { distinctTokens } from './relatedTokens';

const token = (
  id: string,
  name: string,
  oracleId?: string,
  power?: string
): TokenSearchResult => ({
  ref: {
    id,
    name,
    typeLine: 'Token Creature — Soldier',
    faces: [],
    ...(power && { power, toughness: power }),
  },
  setCode: 'tst',
  setName: 'Test',
  ...(oracleId && { oracleId }),
});

describe('distinctTokens', () => {
  it('lists each token once across cards, by name', () => {
    const made: Record<string, TokenSearchResult[]> = {
      a: [token('t1', 'Treasure', 'o-t'), token('s1', 'Soldier', 'o-s1')],
      b: [token('t2', 'Treasure', 'o-t'), token('s2', 'Soldier', 'o-s2')],
      // No oracle id: told apart by name, type and stats.
      c: [
        token('x1', 'Spirit', undefined, '1'),
        token('x2', 'Spirit', undefined, '1'),
      ],
      d: [token('x3', 'Spirit', undefined, '2')],
    };
    const found = distinctTokens(
      ['a', 'b', 'c', 'd', 'e'],
      (id) => made[id] ?? []
    );
    expect(found.map((t) => t.ref.id)).toEqual(['s1', 's2', 'x1', 'x3', 't1']);
  });
});
