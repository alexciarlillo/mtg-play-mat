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

  it('accepts the card manipulation actions', () => {
    const ref = {
      id: '1bdb2914-bba2-4cb6-802e-af2aeef46de8',
      name: 'Soldier',
      typeLine: 'Token Creature — Soldier',
      faces: [{ name: 'Soldier', typeLine: 'Token Creature — Soldier' }],
      power: '1',
      toughness: '1',
      layout: 'token',
      extra: 'dropped',
    };
    const { extra: _extra, ...cleanRef } = ref;
    expect(
      parsePlayerAction({ type: 'createTokens', playerId: 'p1', ref, count: 2 })
    ).toEqual({
      type: 'createTokens',
      playerId: 'p1',
      ref: cleanRef,
      count: 2,
    });
    const custom = {
      id: '',
      custom: true,
      name: 'Spirit',
      typeLine: 'Token Creature — Spirit',
      faces: [{ name: 'Spirit', typeLine: 'Token Creature — Spirit' }],
      power: '1',
      toughness: '1',
    };
    expect(
      parsePlayerAction({
        type: 'createTokens',
        playerId: 'p1',
        ref: custom,
        count: 1,
      })
    ).toMatchObject({ ref: custom });
    expect(
      parsePlayerAction({
        type: 'adjustCounter',
        instanceId: 'p1:1',
        counter: '  charge ',
        delta: -2,
      })
    ).toEqual({
      type: 'adjustCounter',
      instanceId: 'p1:1',
      counter: 'charge',
      delta: -2,
    });
    expect(
      parsePlayerAction({
        type: 'adjustPlayerCounter',
        playerId: 'p1',
        counter: 'poison',
        delta: 1,
      })
    ).toEqual({
      type: 'adjustPlayerCounter',
      playerId: 'p1',
      counter: 'poison',
      delta: 1,
    });
    expect(
      parsePlayerAction({
        type: 'setFaceDown',
        instanceId: 'p1:1',
        faceDown: true,
      })
    ).toEqual({ type: 'setFaceDown', instanceId: 'p1:1', faceDown: true });
    expect(
      parsePlayerAction({ type: 'attach', instanceId: 'p1:1', to: 'p1:2' })
    ).toEqual({ type: 'attach', instanceId: 'p1:1', to: 'p1:2' });
    expect(
      parsePlayerAction({ type: 'attach', instanceId: 'p1:1', to: null })
    ).toEqual({ type: 'attach', instanceId: 'p1:1', to: null });
    for (const type of ['copyCard', 'transform']) {
      expect(parsePlayerAction({ type, instanceId: 'p1:0' })).toEqual({
        type,
        instanceId: 'p1:0',
      });
    }
    expect(
      parsePlayerAction({
        type: 'moveCard',
        instanceId: 'p1:3',
        to: 'battlefield',
        faceDown: true,
        faceIndex: 1,
      })
    ).toEqual({
      type: 'moveCard',
      instanceId: 'p1:3',
      to: 'battlefield',
      faceDown: true,
      faceIndex: 1,
    });
  });

  it('caps huge draw and token counts', () => {
    expect(
      parsePlayerAction({ type: 'draw', playerId: 'p1', count: 1e9 })
    ).toMatchObject({ count: 1000 });
    expect(
      parsePlayerAction({
        type: 'createTokens',
        playerId: 'p1',
        count: 1e9,
        ref: { id: '', custom: true, name: 'X', typeLine: '', faces: [] },
      })
    ).toMatchObject({ count: 100 });
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
      'a blank counter name',
      { type: 'adjustCounter', instanceId: 'a', counter: '  ', delta: 1 },
    ],
    [
      'a long counter name',
      {
        type: 'adjustCounter',
        instanceId: 'a',
        counter: 'x'.repeat(41),
        delta: 1,
      },
    ],
    [
      'a fractional counter delta',
      { type: 'adjustCounter', instanceId: 'a', counter: 'c', delta: 0.5 },
    ],
    ['a missing ref', { type: 'createTokens', playerId: 'p', count: 1 }],
    [
      'a ref with a made-up id',
      {
        type: 'createTokens',
        playerId: 'p',
        count: 1,
        ref: { id: '../etc', name: 'X', typeLine: '', faces: [] },
      },
    ],
    [
      'a custom ref with an id',
      {
        type: 'createTokens',
        playerId: 'p',
        count: 1,
        ref: {
          id: '1bdb2914-bba2-4cb6-802e-af2aeef46de8',
          custom: true,
          name: 'X',
          typeLine: '',
          faces: [],
        },
      },
    ],
    [
      'zero tokens',
      {
        type: 'createTokens',
        playerId: 'p',
        count: 0,
        ref: { id: '', custom: true, name: 'X', typeLine: '', faces: [] },
      },
    ],
    [
      'a non-boolean faceDown',
      { type: 'setFaceDown', instanceId: 'a', faceDown: 'yes' },
    ],
    ['a missing attach target', { type: 'attach', instanceId: 'a' }],
    [
      'a negative face',
      { type: 'moveCard', instanceId: 'a', to: 'battlefield', faceIndex: -1 },
    ],
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
