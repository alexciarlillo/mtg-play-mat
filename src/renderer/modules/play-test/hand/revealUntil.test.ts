import type { CardView } from '@shared/game';
import { describe, expect, it } from 'vitest';

import {
  finishAction,
  matcher,
  parseStop,
  revealCap,
  revealUntilTarget,
} from './revealUntil';

const card = (n: number, typeLine: string): CardView => ({
  instanceId: `p1:${n}`,
  ref: { id: `id-${n}`, name: `Card ${n}`, typeLine, faces: [] },
  owner: 'p1',
  controller: 'p1',
  zone: 'library',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
});

const noFacts = () => undefined;

describe('reveal until', () => {
  const library = [
    card(0, 'Basic Land — Forest'),
    card(1, 'Land'),
    card(2, 'Creature — Elf'),
    card(3, 'Instant'),
  ];

  it('stops at the first match after what is already shown', () => {
    const creature = matcher(parseStop('creature', '').node, noFacts);
    expect(revealUntilTarget(library, creature, 0)).toBe(3);
    const nonland = matcher(parseStop('nonland', '').node, noFacts);
    expect(revealUntilTarget(library, nonland, 3)).toBe(4);
    const land = matcher(parseStop('land', '').node, noFacts);
    // Nothing left matches, so everything left is shown.
    expect(revealUntilTarget(library, land, 2)).toBe(4);
  });

  it('never reveals more than a peer accepts', () => {
    const big = Array.from({ length: 150 }, (_, i) => card(i, 'Land'));
    const never = matcher(parseStop('creature', '').node, noFacts);
    expect(revealCap(big.length)).toBe(100);
    expect(revealUntilTarget(big, never, 0)).toBe(100);
  });

  it('no stop matches nothing; an empty query is no stop', () => {
    expect(matcher(parseStop('none', '').node, noFacts)(library[2]!)).toBe(
      false
    );
    expect(parseStop('query', '  ').node).toBeNull();
  });

  it('builds one finishing action', () => {
    const ids = ['a', 'b', 'c'];
    expect(finishAction('p1', ids, 'c', 'exile', 'bottom')).toEqual({
      type: 'arrangeTop',
      playerId: 'p1',
      top: [],
      bottom: ['a', 'b'],
      graveyard: [],
      exile: ['c'],
      hand: [],
      bottomRandom: true,
    });
    // One card left needs no random order.
    expect(finishAction('p1', ['a', 'b'], 'a', 'hand', 'bottom')).toEqual(
      expect.not.objectContaining({ bottomRandom: true })
    );
  });
});
