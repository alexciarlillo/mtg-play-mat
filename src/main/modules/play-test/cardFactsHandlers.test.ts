// @vitest-environment node
import type { CardFacts } from '@shared/cardQuery';
import type { Printing } from '@shared/types/cards';
import { describe, expect, it, vi } from 'vitest';

import type CardDB from '../../shared/db/CardDB';
import createCardFactsHandlers from './cardFactsHandlers';
import buildSampleDeck from './sampleDeck';

const shock = {
  id: 'p-1',
  name: 'Shock',
  layout: 'normal',
  typeLine: 'Instant',
  cmc: 1,
  colors: ['R'],
  colorIdentity: ['R'],
  keywords: [],
  faces: [{ name: 'Shock', typeLine: 'Instant', oracleText: '2 damage.' }],
} as unknown as Printing;

const setup = (printings: Printing[] = []) => {
  const printingsByIds = vi.fn((ids: string[]) =>
    printings.filter((p) => ids.includes(p.id))
  );
  const cardDb = { printingsByIds } as unknown as CardDB;
  const handlers = createCardFactsHandlers({ cardDb });
  const getCardFacts = (ids: string[]) =>
    handlers.getCardFacts(ids) as Record<string, CardFacts>;
  return { printingsByIds, getCardFacts };
};

describe('getCardFacts', () => {
  it('returns facts for known printings and leaves unknown ids out', () => {
    const { getCardFacts } = setup([shock]);
    expect(getCardFacts(['p-1', 'nope'])).toEqual({
      'p-1': {
        mv: 1,
        colors: ['R'],
        colorIdentity: ['R'],
        keywords: [],
        faces: [
          { name: 'Shock', typeLine: 'Instant', oracleText: '2 damage.' },
        ],
      },
    });
  });

  it('falls back to built-in facts for the sample deck', () => {
    const { getCardFacts } = setup();
    const ids = [...new Set(buildSampleDeck().map((ref) => ref.id))];
    const facts = getCardFacts(ids);
    expect(Object.keys(facts).sort()).toEqual([...ids].sort());
    const delver = buildSampleDeck().find((r) => r.name.startsWith('Delver'));
    expect(facts[delver!.id]?.faces.map((f) => f.oracleText)).toEqual([
      expect.stringContaining('upkeep'),
      'Flying',
    ]);
  });

  it('ignores malformed input', () => {
    const { getCardFacts, printingsByIds } = setup([shock]);
    expect(getCardFacts('p-1' as unknown as string[])).toEqual({});
    getCardFacts(['p-1', 'p-1', 7, '', 'x'.repeat(65)] as unknown as string[]);
    expect(printingsByIds).toHaveBeenLastCalledWith(['p-1']);
  });

  it('treats prototype names as plain unknown ids', () => {
    const { getCardFacts } = setup([shock]);
    const facts = getCardFacts(['__proto__', 'constructor', 'p-1']);
    expect(Object.keys(facts)).toEqual(['p-1']);
    expect(Object.getPrototypeOf(facts)).toBe(Object.prototype);
  });
});
