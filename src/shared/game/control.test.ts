import { describe, expect, it } from 'vitest';

import {
  borrowedFrom,
  departures,
  describeDeparture,
  describeRegain,
  lentCard,
  lentTo,
  permanentState,
} from './control';
import { undoLast } from './history';
import { reduce, replay } from './reducer';
import { applyAll, deepFreeze, player, startGame, zone } from './testFixtures';
import type { GameAction, GameState, LentCard } from './types';
import { actionPlayer } from './validate';
import { publicView } from './views';

const OWNER = 'alice';
const TAKER = 'bob';

// Alice's game with her first two cards on the battlefield.
const ownerGame = (): GameState => {
  const drawn = reduce(startGame([player(OWNER, 10)]), {
    type: 'draw',
    playerId: OWNER,
    count: 6,
  });
  const [a, b] = zone(drawn, OWNER, 'hand');
  return applyAll(drawn, [
    { type: 'moveCard', instanceId: a, to: 'battlefield' },
    { type: 'moveCard', instanceId: b, to: 'battlefield' },
  ]);
};

// Bob's game, holding one of Alice's permanents.
const takerGame = (card: LentCard): GameState =>
  reduce(startGame([player(TAKER, 6)]), {
    type: 'gainControl',
    playerId: TAKER,
    owner: OWNER,
    card,
  });

const lent = (state: GameState, id: string): LentCard =>
  lentCard(state.cards[id]);

describe('giving control', () => {
  it('sets the permanent aside without touching the rest of the deck', () => {
    const state = deepFreeze(ownerGame());
    const [id, other] = zone(state, OWNER, 'battlefield');
    const next = reduce(state, {
      type: 'giveControl',
      instanceId: id,
      to: TAKER,
    });

    expect(zone(next, OWNER, 'battlefield')).toEqual([other]);
    expect(next.cards[id]).toMatchObject({ owner: OWNER, controller: TAKER });
    expect(Object.keys(next.cards)).toEqual(Object.keys(state.cards));
    expect(lentTo(next, TAKER).map((card) => card.instanceId)).toEqual([id]);
    // Nobody at this table sees it, and the owner can no longer act on it.
    expect(
      publicView(next, OWNER)?.zones.battlefield.map((c) => c.instanceId)
    ).toEqual([other]);
    expect(actionPlayer(next, { type: 'tap', instanceId: id })).toBe(TAKER);
  });

  it('only gives a permanent its owner controls', () => {
    const state = ownerGame();
    const hand = zone(state, OWNER, 'hand')[0];
    const [id] = zone(state, OWNER, 'battlefield');
    const given = reduce(state, {
      type: 'giveControl',
      instanceId: id,
      to: TAKER,
    });

    [
      { type: 'giveControl', instanceId: hand, to: TAKER },
      { type: 'giveControl', instanceId: id, to: OWNER },
    ].forEach((action) => {
      expect(reduce(state, action as GameAction)).toBe(state);
    });
    expect(
      reduce(given, { type: 'giveControl', instanceId: id, to: 'carol' })
    ).toBe(given);
  });

  it('lets go of attachments on both sides', () => {
    const state = ownerGame();
    const [host, aura] = zone(state, OWNER, 'battlefield');
    const attached = reduce(state, {
      type: 'attach',
      instanceId: aura,
      to: host,
    });
    const next = reduce(attached, {
      type: 'giveControl',
      instanceId: host,
      to: TAKER,
    });
    expect(next.cards[aura].attachedTo).toBeNull();
  });
});

describe('borrowing a permanent', () => {
  it('puts it on the new controller’s battlefield, as it was', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const tapped = applyAll(owner, [
      { type: 'tap', instanceId: id },
      { type: 'adjustCounter', instanceId: id, counter: '+1/+1', delta: 2 },
    ]);
    const state = takerGame(lent(tapped, id));

    expect(zone(state, TAKER, 'battlefield')).toEqual([id]);
    expect(state.cards[id]).toMatchObject({
      owner: OWNER,
      controller: TAKER,
      tapped: true,
      counters: { '+1/+1': 2 },
    });
    expect(borrowedFrom(state, OWNER)).toHaveLength(1);
    expect(actionPlayer(state, { type: 'untap', instanceId: id })).toBe(TAKER);
  });

  it('refuses a card it already has', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const state = takerGame(lent(owner, id));
    const again = reduce(state, {
      type: 'gainControl',
      playerId: TAKER,
      owner: OWNER,
      card: lent(owner, id),
    });
    expect(again).toBe(state);
  });

  it('never lets the borrowed card into the controller’s own zones', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const state = takerGame(lent(owner, id));
    const graveyard = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'graveyard',
    });
    expect(graveyard.cards[id]).toBeUndefined();
    expect(zone(graveyard, TAKER, 'graveyard')).toEqual([]);
    expect(zone(graveyard, TAKER, 'battlefield')).toEqual([]);

    const shuffled = reduce(state, {
      type: 'shuffleIntoLibrary',
      instanceId: id,
    });
    expect(shuffled.cards[id]).toBeUndefined();
    expect(zone(shuffled, TAKER, 'library')).toEqual(
      zone(state, TAKER, 'library')
    );
  });

  it('keeps it through a move around the battlefield', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const state = takerGame(lent(owner, id));
    const moved = reduce(state, {
      type: 'setPosition',
      instanceId: id,
      position: { x: 50, y: 60 },
    });
    expect(moved.cards[id].position).toEqual({ x: 50, y: 60 });
    expect(
      departures(
        state,
        { type: 'setPosition', instanceId: id, position: { x: 50, y: 60 } },
        moved
      )
    ).toEqual([]);
  });

  it('releases it back without a trace', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const state = takerGame(lent(owner, id));
    const released = reduce(state, {
      type: 'releaseControl',
      instanceIds: [id],
    });
    expect(released.cards[id]).toBeUndefined();
    expect(zone(released, TAKER, 'battlefield')).toEqual([]);
    // A card of the controller's own is never released.
    const own = zone(state, TAKER, 'library')[0];
    expect(reduce(state, { type: 'releaseControl', instanceIds: [own] })).toBe(
      state
    );
  });
});

describe('departures', () => {
  const setup = () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    return { id, state: takerGame(lent(owner, id)) };
  };

  it('say where the controller sent the card', () => {
    const { id, state } = setup();
    const cases: [GameAction, object][] = [
      [
        { type: 'moveCard', instanceId: id, to: 'graveyard' },
        { to: 'graveyard' },
      ],
      [
        { type: 'moveCard', instanceId: id, to: 'library', index: 0 },
        { to: 'library', index: 0 },
      ],
      [
        { type: 'shuffleIntoLibrary', instanceId: id },
        { to: 'library', shuffle: true },
      ],
      [{ type: 'releaseControl', instanceIds: [id] }, { to: 'battlefield' }],
    ];
    cases.forEach(([action, where]) => {
      const [left] = departures(state, action, reduce(state, action));
      expect(left.change).toMatchObject({
        op: 'return',
        instanceId: id,
        ...where,
      });
    });
  });

  it('are told in the controller’s log with the owner’s zones', () => {
    const { id, state } = setup();
    const move = (action: GameAction) =>
      describeDeparture(
        departures(state, action, reduce(state, action))[0],
        'Alice'
      );
    expect(move({ type: 'moveCard', instanceId: id, to: 'graveyard' })).toBe(
      "put alice 0 into Alice's graveyard"
    );
    expect(move({ type: 'moveCard', instanceId: id, to: 'library' })).toBe(
      "put alice 0 on the bottom of Alice's library"
    );
    expect(move({ type: 'releaseControl', instanceIds: [id] })).toBe(
      'returned alice 0 to Alice'
    );
  });
});

describe('regaining control', () => {
  const lentGame = () => {
    const state = ownerGame();
    const [id, other] = zone(state, OWNER, 'battlefield');
    return {
      id,
      other,
      state: reduce(state, { type: 'giveControl', instanceId: id, to: TAKER }),
    };
  };

  it('puts a returned permanent back on the battlefield as it is', () => {
    const { id, other, state } = lentGame();
    const back = reduce(state, {
      type: 'regainControl',
      instanceId: id,
      to: 'battlefield',
      state: {
        tapped: true,
        faceDown: false,
        faceIndex: 0,
        counters: { x: 1 },
      },
    });
    expect(zone(back, OWNER, 'battlefield')).toEqual([other, id]);
    expect(back.cards[id]).toMatchObject({
      controller: OWNER,
      tapped: true,
      counters: { x: 1 },
    });
  });

  it('puts one that died into the owner’s graveyard, as a new object', () => {
    const { id, state } = lentGame();
    const change = {
      type: 'regainControl' as const,
      instanceId: id,
      to: 'graveyard' as const,
      state: {
        tapped: true,
        faceDown: false,
        faceIndex: 0,
        counters: { x: 1 },
      },
    };
    const back = reduce(state, change);
    expect(zone(back, OWNER, 'graveyard')).toEqual([id]);
    expect(back.cards[id]).toMatchObject({
      zone: 'graveyard',
      controller: OWNER,
      tapped: false,
      counters: {},
    });
    expect(
      describeRegain(state.cards[id], { op: 'return', ...change }, 'Bob')
    ).toBe('got alice 0 back from Bob, into their graveyard');
  });

  it('shuffles one sent into the library', () => {
    const { id, state } = lentGame();
    const back = reduce(state, {
      type: 'regainControl',
      instanceId: id,
      to: 'library',
      shuffle: true,
      state: permanentState(state.cards[id]),
    });
    expect(zone(back, OWNER, 'library')).toContain(id);
    expect(back.rng).not.toBe(state.rng);
  });

  it('ignores a card that is not lent', () => {
    const state = ownerGame();
    const [id] = zone(state, OWNER, 'battlefield');
    expect(
      reduce(state, {
        type: 'regainControl',
        instanceId: id,
        to: 'graveyard',
        state: permanentState(state.cards[id]),
      })
    ).toBe(state);
  });

  it('removes a token that died under the other player', () => {
    const base = reduce(ownerGame(), {
      type: 'createTokens',
      playerId: OWNER,
      ref: { id: '', name: 'Soldier', typeLine: 'Token', faces: [] },
      count: 1,
    });
    const token = zone(base, OWNER, 'battlefield').at(-1) as string;
    const state = reduce(base, {
      type: 'giveControl',
      instanceId: token,
      to: TAKER,
    });
    const back = reduce(state, {
      type: 'regainControl',
      instanceId: token,
      to: 'graveyard',
      state: permanentState(state.cards[token]),
    });
    expect(back.cards[token]).toBeUndefined();
  });
});

describe('control and history', () => {
  it('replays the same from the log', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const state = reduce(
      reduce(owner, { type: 'giveControl', instanceId: id, to: TAKER }),
      {
        type: 'regainControl',
        instanceId: id,
        to: 'exile',
        state: permanentState(owner.cards[id]),
      }
    );
    expect(replay(state.log)).toEqual(state);
  });

  it('is never what undo takes back', () => {
    const owner = ownerGame();
    const [id] = zone(owner, OWNER, 'battlefield');
    const given = reduce(owner, {
      type: 'giveControl',
      instanceId: id,
      to: TAKER,
    });
    const undone = undoLast(given, OWNER, 1);
    // The move before it is undone instead, and the card stays lent.
    expect(undone?.action.type).toBe('moveCard');
  });
});
