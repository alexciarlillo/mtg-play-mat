// @vitest-environment node
import { typeGroup } from '@shared/decks/cardTypes';
import { exportDeck } from '@shared/decks/exportDeck';
import type { DeckCard, PrintingSummary } from '@shared/types/decks';
import { describe, expect, it } from 'vitest';

import { parseDeckList } from './parseDeckList';

const printing = (p: Partial<PrintingSummary>): PrintingSummary => ({
  id: 'x',
  oracleId: null,
  name: 'Sol Ring',
  layout: 'normal',
  typeLine: 'Artifact',
  manaCost: '{1}',
  cmc: 1,
  setCode: 'c21',
  setName: 'Commander 2021',
  collectorNumber: '263',
  keyruneCode: 'c21',
  releasedAt: null,
  lang: 'en',
  digital: false,
  promo: false,
  ...p,
});

const cards: DeckCard[] = [
  { printingId: 'a', qty: 1, board: 'main', printing: printing({}) },
  {
    printingId: 'b',
    qty: 1,
    board: 'commander',
    printing: printing({
      name: "Atraxa, Praetors' Voice",
      setCode: 'c16',
      collectorNumber: '28',
    }),
  },
  {
    printingId: 'c',
    qty: 2,
    board: 'side',
    printing: printing({
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
      setCode: 'isd',
      collectorNumber: '51',
    }),
  },
  { printingId: 'd', qty: 1, board: 'main', printing: null },
];

describe('exportDeck', () => {
  it('writes MTGA sections with front-face names', () => {
    expect(exportDeck(cards, 'mtga')).toBe(
      [
        'Commander',
        "1 Atraxa, Praetors' Voice (C16) 28",
        '',
        'Deck',
        '1 Sol Ring (C21) 263',
        '',
        'Sideboard',
        '2 Delver of Secrets (ISD) 51',
        '',
      ].join('\n')
    );
  });

  it('keeps full names for Moxfield and round-trips through the parser', () => {
    const text = exportDeck(cards, 'moxfield');
    expect(text).toContain(
      '2 Delver of Secrets // Insectile Aberration (ISD) 51'
    );
    const parsed = parseDeckList(text);
    expect(parsed.cards.map((c) => [c.qty, c.board, c.setCode])).toEqual([
      [1, 'commander', 'C16'],
      [1, 'main', 'C21'],
      [2, 'side', 'ISD'],
    ]);
    expect(parsed.notes).toEqual([]);
  });
});

describe('typeGroup', () => {
  it.each([
    ['Artifact Creature — Golem', 'Creature'],
    ['Artifact Land', 'Land'],
    ['Legendary Planeswalker — Jace', 'Planeswalker'],
    ['Creature — Giant // Instant — Adventure', 'Creature'],
    ['Instant', 'Instant'],
    ['Kindred Sorcery — Elf', 'Sorcery'],
    ['Legendary Enchantment Artifact', 'Artifact'],
    ['Battle — Siege // Creature — Elemental', 'Battle'],
    [null, 'Other'],
  ])('%s -> %s', (typeLine, group) => {
    expect(typeGroup(typeLine)).toBe(group);
  });
});
