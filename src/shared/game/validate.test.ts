import { describe, expect, it } from 'vitest';

import { applyAll, player, startGame, zone } from './testFixtures';
import {
  actionPlayer,
  InvalidActionError,
  parsePlayerAction,
} from './validate';

describe('parsePlayerAction', () => {
  it('accepts each player action and drops unknown fields', () => {
    expect(
      parsePlayerAction({ type: 'draw', playerId: 'p1', count: 2, extra: 1 })
    ).toEqual({ type: 'draw', playerId: 'p1', count: 2 });
    expect(parsePlayerAction({ type: 'shuffle', playerId: 'p1' })).toEqual({
      type: 'shuffle',
      playerId: 'p1',
    });
    expect(
      parsePlayerAction({ type: 'moveCard', instanceId: 'p1:3', to: 'hand' })
    ).toEqual({ type: 'moveCard', instanceId: 'p1:3', to: 'hand' });
    expect(
      parsePlayerAction({
        type: 'moveCard',
        instanceId: 'p1:3',
        to: 'battlefield',
        index: 0,
        position: { x: 1.5, y: -2, z: 9 },
      })
    ).toEqual({
      type: 'moveCard',
      instanceId: 'p1:3',
      to: 'battlefield',
      index: 0,
      position: { x: 1.5, y: -2 },
    });
    expect(
      parsePlayerAction({
        type: 'setPosition',
        instanceId: 'p1:3',
        position: { x: 10, y: 20 },
      })
    ).toEqual({
      type: 'setPosition',
      instanceId: 'p1:3',
      position: { x: 10, y: 20 },
    });
    for (const type of ['untapAll', 'mulligan']) {
      expect(parsePlayerAction({ type, playerId: 'p1', x: 1 })).toEqual({
        type,
        playerId: 'p1',
      });
    }
    expect(
      parsePlayerAction({ type: 'adjustLife', playerId: 'p1', delta: -3 })
    ).toEqual({ type: 'adjustLife', playerId: 'p1', delta: -3 });
    expect(
      parsePlayerAction({ type: 'setLife', playerId: 'p1', life: -2 })
    ).toEqual({ type: 'setLife', playerId: 'p1', life: -2 });
    expect(
      parsePlayerAction({ type: 'keepHand', playerId: 'p1', bottom: ['a'] })
    ).toEqual({ type: 'keepHand', playerId: 'p1', bottom: ['a'] });
    for (const type of ['tap', 'untap', 'toggleTap', 'shuffleIntoLibrary']) {
      expect(parsePlayerAction({ type, instanceId: 'p1:0' })).toEqual({
        type,
        instanceId: 'p1:0',
      });
    }
  });

  it('caps huge draw counts', () => {
    expect(
      parsePlayerAction({ type: 'draw', playerId: 'p1', count: 1e9 })
    ).toMatchObject({ count: 1000 });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'draw'],
    ['an unknown type', { type: 'explode' }],
    ['newGame from a window', { type: 'newGame', seed: 1, players: [] }],
    ['a missing playerId', { type: 'draw', count: 1 }],
    ['a zero count', { type: 'draw', playerId: 'p1', count: 0 }],
    ['a fractional count', { type: 'draw', playerId: 'p1', count: 1.5 }],
    ['a string count', { type: 'draw', playerId: 'p1', count: '1' }],
    ['an empty instanceId', { type: 'tap', instanceId: '' }],
    ['a numeric instanceId', { type: 'tap', instanceId: 3 }],
    ['an unknown zone', { type: 'moveCard', instanceId: 'a', to: 'sideboard' }],
    [
      'a negative index',
      { type: 'moveCard', instanceId: 'a', to: 'library', index: -1 },
    ],
    [
      'a NaN position',
      { type: 'setPosition', instanceId: 'a', position: { x: NaN, y: 0 } },
    ],
    ['a missing position', { type: 'setPosition', instanceId: 'a' }],
    ['a fractional delta', { type: 'adjustLife', playerId: 'p', delta: 0.5 }],
    ['a huge life', { type: 'setLife', playerId: 'p', life: 1e12 }],
    ['a missing life', { type: 'setLife', playerId: 'p' }],
    ['a non-array bottom', { type: 'keepHand', playerId: 'p', bottom: 'a' }],
    ['a numeric bottom id', { type: 'keepHand', playerId: 'p', bottom: [1] }],
    ['an empty-id shuffle', { type: 'shuffleIntoLibrary', instanceId: '' }],
    [
      'an infinite position',
      {
        type: 'moveCard',
        instanceId: 'a',
        to: 'battlefield',
        position: { x: 0, y: Infinity },
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => parsePlayerAction(input)).toThrow(InvalidActionError);
  });
});

describe('actionPlayer', () => {
  it('names the player an action would change', () => {
    const state = applyAll(startGame([player('p1'), player('p2')]), [
      { type: 'draw', playerId: 'p2', count: 1 },
    ]);
    const [p2Card] = zone(state, 'p2', 'hand');

    expect(actionPlayer(state, { type: 'shuffle', playerId: 'p1' })).toBe('p1');
    expect(actionPlayer(state, { type: 'tap', instanceId: p2Card })).toBe('p2');
    expect(actionPlayer(state, { type: 'tap', instanceId: 'missing' })).toBe(
      null
    );
  });
});
