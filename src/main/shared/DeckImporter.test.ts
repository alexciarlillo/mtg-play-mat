// @vitest-environment node
import type { Printing } from '@shared/types/cards';
import { describe, expect, it, vi } from 'vitest';

import type CardDB from './db/CardDB';
import DeckImporter from './DeckImporter';

describe('DeckImporter.ParseLine', () => {
  it('parses count, name, set code and collector number', () => {
    expect(DeckImporter.ParseLine('4 Llanowar Elves (M19) 314')).toEqual({
      count: 4,
      name: 'Llanowar Elves',
      setCode: 'M19',
      number: '314',
    });
  });

  it('accepts square-bracket set codes without a number', () => {
    expect(DeckImporter.ParseLine('1 Grizzly Bears [10E]')).toEqual({
      count: 1,
      name: 'Grizzly Bears',
      setCode: '10E',
      number: null,
    });
  });
});

describe('DeckImporter.importFromString', () => {
  const forest = { name: 'Forest', id: 'forest-id' } as Printing;

  const makeImporter = () => {
    const getCard = vi.fn(({ name }: { name: string }) =>
      name === 'Forest' ? forest : undefined
    );
    const cardDb = { getCard } as unknown as CardDB;
    return { importer: new DeckImporter({ cardDb }), getCard };
  };

  it('expands counts into one entry per copy', () => {
    const { importer } = makeImporter();
    const cards = importer.importFromString({ string: '3 Forest (M21) 272' });

    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.id === 'forest-id')).toBe(true);
  });

  it('skips blank lines and unresolved cards instead of throwing', () => {
    const { importer } = makeImporter();
    const cards = importer.importFromString({
      string: '2 Forest (M21) 272\n\n1 Not A Card (XXX) 1\n',
    });

    expect(cards).toHaveLength(2);
  });
});
