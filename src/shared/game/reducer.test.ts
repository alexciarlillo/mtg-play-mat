import { describe, expect, it } from 'vitest';

import { cascadePosition, emptyGame } from './core';
import { reduce, replay } from './reducer';
import {
  applyAll,
  cardRef,
  deepFreeze,
  player,
  startGame,
  zone,
} from './testFixtures';
import type { GameAction, GameState } from './types';

const P1 = 'p1';

const draw = (count = 1): GameAction => ({ type: 'draw', playerId: P1, count });

const play = (state: GameState, handIndex = 0) =>
  reduce(state, {
    type: 'moveCard',
    instanceId: zone(state, P1, 'hand')[handIndex],
    to: 'battlefield',
  });

describe('newGame', () => {
  it('builds N players with their decks in library order', () => {
    const state = startGame([
      player('p1', 3),
      player('p2', 2, { life: 40, command: [cardRef('Commander')] }),
    ]);

    expect(state.players.map((p) => [p.id, p.life])).toEqual([
      ['p1', 20],
      ['p2', 40],
    ]);
    expect(
      zone(state, 'p1', 'library').map((id) => state.cards[id].ref.name)
    ).toEqual(['p1 0', 'p1 1', 'p1 2']);
    expect(
      zone(state, 'p2', 'command').map((id) => state.cards[id].ref.name)
    ).toEqual(['Commander']);

    const ids = Object.keys(state.cards);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(state.cards[zone(state, 'p2', 'library')[0]]).toMatchObject({
      owner: 'p2',
      controller: 'p2',
      zone: 'library',
      position: null,
      tapped: false,
      faceDown: false,
      faceIndex: 0,
      counters: {},
      isToken: false,
    });
  });

  it('starts a fresh log and keeps seq increasing across games', () => {
    const first = applyAll(startGame(), [draw(2)]);
    expect(first.seq).toBe(2);
    expect(first.log.map((a) => a.type)).toEqual(['newGame', 'draw']);

    const action: GameAction = {
      type: 'newGame',
      seed: 1,
      players: [player('p1', 5)],
    };
    const second = reduce(first, action);
    expect(second.seq).toBe(3);
    expect(second.log).toEqual([action]);
    expect(zone(second, P1, 'hand')).toEqual([]);
    expect(zone(second, P1, 'library')).toHaveLength(5);
  });
});

describe('shuffle', () => {
  it('is deterministic for a seed and advances the PRNG', () => {
    const shuffleP1: GameAction = { type: 'shuffle', playerId: P1 };
    const a = reduce(startGame([player('p1', 30)], 99), shuffleP1);
    const b = reduce(startGame([player('p1', 30)], 99), shuffleP1);
    const c = reduce(startGame([player('p1', 30)], 100), shuffleP1);

    expect(zone(a, P1, 'library')).toEqual(zone(b, P1, 'library'));
    expect(zone(a, P1, 'library')).not.toEqual(zone(c, P1, 'library'));
    expect([...zone(a, P1, 'library')].sort()).toEqual(
      [...zone(startGame([player('p1', 30)]), P1, 'library')].sort()
    );

    const twice = reduce(a, shuffleP1);
    expect(twice.rng).not.toBe(a.rng);
    expect(zone(twice, P1, 'library')).not.toEqual(zone(a, P1, 'library'));
  });

  it('ignores unknown players', () => {
    const state = startGame();
    expect(reduce(state, { type: 'shuffle', playerId: 'nobody' })).toBe(state);
  });
});

describe('draw', () => {
  it('moves cards from the top of the library to the hand', () => {
    const state = startGame([player('p1', 5)]);
    const top = zone(state, P1, 'library').slice(0, 2);
    const next = reduce(state, draw(2));

    expect(zone(next, P1, 'hand')).toEqual(top);
    expect(zone(next, P1, 'library')).toHaveLength(3);
    expect(next.cards[top[0]].zone).toBe('hand');
    expect(next.log.at(-1)).toEqual(draw(2));
  });

  it('draws at most what is left, and is a no-op on an empty library', () => {
    const state = reduce(startGame([player('p1', 2)]), draw(5));
    expect(zone(state, P1, 'hand')).toHaveLength(2);

    const again = reduce(state, draw());
    expect(again).toBe(state);
    expect(again.log).toHaveLength(2);
  });

  it('only touches the drawing player', () => {
    const state = startGame([player('p1'), player('p2')]);
    const next = reduce(state, { type: 'draw', playerId: 'p2', count: 3 });
    expect(zone(next, 'p2', 'hand')).toHaveLength(3);
    expect(next.players[0]).toBe(state.players[0]);
  });
});

describe('moveCard', () => {
  it('places cards on the battlefield in a cascade by default', () => {
    let state = applyAll(startGame(), [draw(3)]);
    state = play(play(state));

    const [first, second] = zone(state, P1, 'battlefield');
    expect(state.cards[first].position).toEqual(cascadePosition(0));
    expect(state.cards[second].position).toEqual(cascadePosition(1));
    expect(zone(state, P1, 'hand')).toHaveLength(1);
  });

  it('uses an explicit position and index', () => {
    const state = applyAll(startGame(), [draw(2)]);
    const [a, b] = zone(state, P1, 'hand');

    const placed = reduce(state, {
      type: 'moveCard',
      instanceId: a,
      to: 'battlefield',
      position: { x: 300, y: 150 },
    });
    expect(placed.cards[a].position).toEqual({ x: 300, y: 150 });

    const top = reduce(placed, {
      type: 'moveCard',
      instanceId: b,
      to: 'library',
      index: 0,
    });
    expect(zone(top, P1, 'library')[0]).toBe(b);

    const bottom = reduce(top, {
      type: 'moveCard',
      instanceId: b,
      to: 'library',
    });
    expect(zone(bottom, P1, 'library').at(-1)).toBe(b);
    expect(zone(bottom, P1, 'library')).toHaveLength(9);
  });

  it('resets battlefield state when a card leaves it', () => {
    let state = play(
      applyAll(startGame([player('p1'), player('p2')]), [draw()])
    );
    const [id] = zone(state, P1, 'battlefield');
    state = reduce(state, { type: 'tap', instanceId: id });
    // No action sets counters yet, so set them directly.
    state = {
      ...state,
      cards: {
        ...state.cards,
        [id]: { ...state.cards[id], counters: { '+1/+1': 2 }, faceIndex: 1 },
      },
    };

    const next = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'graveyard',
    });
    expect(next.cards[id]).toMatchObject({
      zone: 'graveyard',
      position: null,
      tapped: false,
      counters: {},
      faceIndex: 0,
      controller: P1,
    });
    expect(zone(next, P1, 'battlefield')).toEqual([]);
    expect(zone(next, P1, 'graveyard')).toEqual([id]);
  });

  it('returns a stolen card to its owner when it leaves the battlefield', () => {
    let state = play(
      applyAll(startGame([player('p1'), player('p2')]), [draw()])
    );
    const [id] = zone(state, P1, 'battlefield');
    // Control change is hand-built until an action for it exists.
    state = {
      ...state,
      cards: { ...state.cards, [id]: { ...state.cards[id], controller: 'p2' } },
      players: state.players.map((p) => ({
        ...p,
        zones: { ...p.zones, battlefield: p.id === 'p2' ? [id] : [] },
      })),
    };

    const next = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'hand',
    });
    expect(next.cards[id].controller).toBe(P1);
    expect(zone(next, 'p2', 'battlefield')).toEqual([]);
    expect(zone(next, P1, 'hand')).toEqual([id]);
  });

  it('removes a token that leaves the battlefield', () => {
    let state = play(applyAll(startGame(), [draw()]));
    const [id] = zone(state, P1, 'battlefield');
    state = {
      ...state,
      cards: { ...state.cards, [id]: { ...state.cards[id], isToken: true } },
    };

    const next = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'exile',
    });
    expect(next.cards[id]).toBeUndefined();
    expect(zone(next, P1, 'exile')).toEqual([]);
    expect(zone(next, P1, 'battlefield')).toEqual([]);
  });

  it('ignores unknown instances', () => {
    const state = startGame();
    expect(
      reduce(state, { type: 'moveCard', instanceId: 'nope', to: 'hand' })
    ).toBe(state);
  });
});

describe('setPosition', () => {
  it('moves a battlefield card and brings it to the front', () => {
    let state = play(play(applyAll(startGame(), [draw(2)])));
    const [first, second] = zone(state, P1, 'battlefield');

    state = reduce(state, {
      type: 'setPosition',
      instanceId: first,
      position: { x: 500, y: 40 },
    });
    expect(state.cards[first].position).toEqual({ x: 500, y: 40 });
    expect(zone(state, P1, 'battlefield')).toEqual([second, first]);
  });

  it('keeps tapped state when moved', () => {
    let state = play(applyAll(startGame(), [draw()]));
    const [id] = zone(state, P1, 'battlefield');
    state = applyAll(state, [
      { type: 'tap', instanceId: id },
      { type: 'setPosition', instanceId: id, position: { x: 1, y: 2 } },
    ]);
    expect(state.cards[id]).toMatchObject({
      tapped: true,
      position: { x: 1, y: 2 },
    });
  });

  it('ignores cards that are not on the battlefield', () => {
    const state = applyAll(startGame(), [draw()]);
    const [id] = zone(state, P1, 'hand');
    expect(
      reduce(state, {
        type: 'setPosition',
        instanceId: id,
        position: { x: 1, y: 1 },
      })
    ).toBe(state);
  });
});

describe('tap / untap / toggleTap', () => {
  it('changes tapped state of battlefield cards', () => {
    let state = play(applyAll(startGame(), [draw()]));
    const [id] = zone(state, P1, 'battlefield');

    state = reduce(state, { type: 'toggleTap', instanceId: id });
    expect(state.cards[id].tapped).toBe(true);
    state = reduce(state, { type: 'toggleTap', instanceId: id });
    expect(state.cards[id].tapped).toBe(false);
    state = reduce(state, { type: 'tap', instanceId: id });
    expect(state.cards[id].tapped).toBe(true);

    expect(reduce(state, { type: 'tap', instanceId: id })).toBe(state);
    state = reduce(state, { type: 'untap', instanceId: id });
    expect(state.cards[id].tapped).toBe(false);
    expect(reduce(state, { type: 'untap', instanceId: id })).toBe(state);
  });

  it('ignores cards off the battlefield', () => {
    const state = applyAll(startGame(), [draw()]);
    const [id] = zone(state, P1, 'hand');
    expect(reduce(state, { type: 'tap', instanceId: id })).toBe(state);
  });
});

describe('purity and replay', () => {
  const script = (state: GameState): GameState => {
    let next = applyAll(state, [{ type: 'shuffle', playerId: P1 }, draw(3)]);
    next = play(next, 1);
    const [id] = zone(next, P1, 'battlefield');
    return applyAll(next, [
      { type: 'setPosition', instanceId: id, position: { x: 90, y: 60 } },
      { type: 'toggleTap', instanceId: id },
      { type: 'shuffle', playerId: P1 },
      draw(2),
    ]);
  };

  it('never mutates its input', () => {
    const start = deepFreeze(startGame([player('p1', 20)]));
    expect(() => script(start)).not.toThrow();
  });

  it('replays the log to the same state', () => {
    const state = script(startGame([player('p1', 20)], 7));
    expect(state.log).toHaveLength(8);
    expect(replay(state.log)).toEqual(state);
  });

  it('gives the same game for the same seed and actions', () => {
    const a = script(startGame([player('p1', 20)], 31337));
    const b = script(startGame([player('p1', 20)], 31337));
    const c = script(startGame([player('p1', 20)], 31338));
    expect(a).toEqual(b);
    expect(zone(a, P1, 'hand')).not.toEqual(zone(c, P1, 'hand'));
  });

  it('has an empty initial state', () => {
    expect(emptyGame()).toEqual({
      seq: 0,
      players: [],
      cards: {},
      rng: 0,
      nextInstanceId: 0,
      log: [],
    });
  });
});
