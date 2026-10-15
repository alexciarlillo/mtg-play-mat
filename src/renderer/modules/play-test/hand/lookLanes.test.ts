import { describe, expect, it } from 'vitest';

import {
  applyPreset,
  dropIndex,
  flatten,
  initialArrangement,
  moveCard,
  presetById,
  restToBottom,
  shiftCard,
  titleFor,
  toAction,
} from './lookLanes';

const ids = ['a', 'b', 'c', 'd'];

describe('look lanes', () => {
  it('starts every card in the preset default lane, in library order', () => {
    expect(initialArrangement(ids, presetById('scry')).top).toEqual(ids);
    expect(initialArrangement(ids, presetById('take')).bottom).toEqual(ids);
    expect(initialArrangement(ids, presetById('dig')).exile).toEqual(ids);
  });

  it('moves a card between lanes, at an index or the end', () => {
    const start = initialArrangement(ids, presetById('look'));
    const moved = moveCard(moveCard(start, 'b', 'bottom'), 'd', 'bottom', 0);
    expect(moved.top).toEqual(['a', 'c']);
    expect(moved.bottom).toEqual(['d', 'b']);
    expect(flatten(moved)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveCard(moved, 'nope', 'hand')).toBe(moved);
  });

  it('reorders within a lane and stops at its ends', () => {
    const start = initialArrangement(ids, presetById('look'));
    expect(shiftCard(start, 'a', 1).top).toEqual(['b', 'a', 'c', 'd']);
    expect(shiftCard(start, 'a', -1)).toBe(start);
    expect(shiftCard(start, 'd', 1)).toBe(start);
  });

  it('sends cards out of lanes a new preset lacks to its default lane', () => {
    const look = moveCard(
      moveCard(initialArrangement(ids, presetById('look')), 'b', 'graveyard'),
      'c',
      'bottom'
    );
    const scry = applyPreset(look, presetById('scry'));
    expect(scry.graveyard).toEqual([]);
    expect(scry.top).toEqual(['a', 'd', 'b']);
    expect(scry.bottom).toEqual(['c']);
  });

  it('sends only the cards not placed yet to the bottom', () => {
    const start = moveCard(
      initialArrangement(ids, presetById('look')),
      'd',
      'hand'
    );
    const next = restToBottom(start, new Set(['b', 'd']));
    expect(next.top).toEqual(['b']);
    expect(next.bottom).toEqual(['a', 'c']);
    expect(next.hand).toEqual(['d']);
  });

  it('finds where a dropped card goes among wrapped rows', () => {
    const row = (top: number, ...lefts: number[]) =>
      lefts.map((left) => ({ left, right: left + 40, top, bottom: top + 20 }));
    const cards = [...row(0, 0, 50, 100), ...row(30, 0, 50)];
    expect(dropIndex(cards, 10, 10)).toBe(0);
    expect(dropIndex(cards, 80, 10)).toBe(2);
    expect(dropIndex(cards, 200, 10)).toBe(3);
    expect(dropIndex(cards, 60, 40)).toBe(4);
    expect(dropIndex(cards, 200, 40)).toBe(5);
    expect(dropIndex([], 0, 0)).toBe(0);
  });

  it('builds one arrangeTop action, random only with two or more', () => {
    const start = moveCard(
      initialArrangement(ids, presetById('look')),
      'a',
      'bottom'
    );
    expect(
      toAction(start, 'p1', { bottomRandom: true, shuffleAfter: false })
    ).toEqual({
      type: 'arrangeTop',
      playerId: 'p1',
      top: ['b', 'c', 'd'],
      bottom: ['a'],
      graveyard: [],
      exile: [],
      hand: [],
    });
    const two = moveCard(start, 'b', 'bottom');
    expect(
      toAction(two, 'p1', { bottomRandom: true, shuffleAfter: true })
    ).toMatchObject({ bottomRandom: true, shuffleAfter: true });
  });

  it('titles each preset', () => {
    expect(titleFor(presetById('scry'), 2, 1)).toBe('Scry 2');
    expect(titleFor(presetById('take'), 4, 1)).toBe('Look at 4, take 1');
    expect(titleFor(presetById('look'), 3, 1)).toBe('Top 3 of your library');
    expect(titleFor(presetById('ponder'), 3, 1)).toBe('Ponder');
  });
});
