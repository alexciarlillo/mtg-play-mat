import { describe, expect, it } from 'vitest';

import { reduce } from './reducer';
import {
  applyAll,
  cardRef,
  deepFreeze,
  player,
  startGame,
  zone,
} from './testFixtures';
import { undoLast } from './history';
import type { GameAction, GameState, SearchPick } from './types';
import { parsePlayerAction } from './validate';
import { publicView } from './views';

const P1 = 'p1';

const names = (state: GameState, ids: string[]) =>
  ids.map((id) => state.cards[id].ref.name);

const library = (state: GameState) => zone(state, P1, 'library');

// p1 0 is on top of an unshuffled ten-card library.
const fresh = () => deepFreeze(startGame([player(P1, 10)]));

describe('mill', () => {
  it('puts the top cards into the graveyard, top first', () => {
    const state = reduce(fresh(), { type: 'mill', playerId: P1, count: 2 });
    expect(names(state, zone(state, P1, 'graveyard'))).toEqual([
      'p1 0',
      'p1 1',
    ]);
    expect(library(state)).toHaveLength(8);
    expect(state.log.at(-1)).toEqual({ type: 'mill', playerId: P1, count: 2 });
  });

  it('stops at an empty library and ignores an empty one', () => {
    const state = reduce(fresh(), { type: 'mill', playerId: P1, count: 50 });
    expect(library(state)).toHaveLength(0);
    expect(zone(state, P1, 'graveyard')).toHaveLength(10);
    expect(reduce(state, { type: 'mill', playerId: P1, count: 1 })).toBe(state);
  });

  it('a milled commander stays a commander', () => {
    const start = startGame([player(P1, 3, { command: [cardRef('Cmdr')] })]);
    const [commander] = zone(start, P1, 'command');
    const state = applyAll(start, [
      { type: 'moveCard', instanceId: commander, to: 'library', index: 0 },
      { type: 'mill', playerId: P1, count: 1 },
    ]);
    expect(state.cards[commander]).toMatchObject({
      zone: 'graveyard',
      isCommander: true,
    });
  });
});

describe('arrangeTop', () => {
  it('reorders, bottoms, mills, and draws in one logged step', () => {
    const state = fresh();
    const [a, b, c, d, e] = library(state);
    const next = reduce(state, {
      type: 'arrangeTop',
      playerId: P1,
      top: [c, a],
      bottom: [b],
      graveyard: [d],
      exile: [],
      hand: [e],
    });
    expect(names(next, library(next))).toEqual([
      'p1 2',
      'p1 0',
      'p1 5',
      'p1 6',
      'p1 7',
      'p1 8',
      'p1 9',
      'p1 1',
    ]);
    expect(zone(next, P1, 'graveyard')).toEqual([d]);
    expect(zone(next, P1, 'hand')).toEqual([e]);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(next.seq).toBe(state.seq + 1);
  });

  it('puts several on the bottom in the order given', () => {
    const state = fresh();
    const [a, b, c] = library(state);
    const next = reduce(state, {
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: [c, a],
      graveyard: [],
      exile: [],
      hand: [b],
    });
    expect(library(next).slice(-2)).toEqual([c, a]);
    expect(library(next)[0]).toBe(zone(state, P1, 'library')[3]);
  });

  it('is a no-op when everything stays where it was', () => {
    const state = fresh();
    const [a, b] = library(state);
    expect(
      reduce(state, {
        type: 'arrangeTop',
        playerId: P1,
        top: [a, b],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
      })
    ).toBe(state);
  });

  it('refuses lists that are not exactly the top cards', () => {
    const state = fresh();
    const [a, b, c] = library(state);
    const base = { type: 'arrangeTop', playerId: P1 } as const;
    const refused: GameAction[] = [
      { ...base, top: [], bottom: [], graveyard: [], exile: [], hand: [] },
      // Skips the second card, so it is not the top two.
      { ...base, top: [c, a], bottom: [], graveyard: [], exile: [], hand: [] },
      { ...base, top: [a, a], bottom: [], graveyard: [], exile: [], hand: [] },
      { ...base, top: [a], bottom: [a], graveyard: [], exile: [], hand: [] },
      {
        ...base,
        top: [b, a, 'nope'],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
      },
      {
        ...base,
        playerId: 'nobody',
        top: [b, a],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
      },
    ];
    refused.forEach((action) => expect(reduce(state, action)).toBe(state));
  });

  it('a card sent to the graveyard in place still moves', () => {
    const state = fresh();
    const [a] = library(state);
    const next = reduce(state, {
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: [],
      graveyard: [a],
      exile: [],
      hand: [],
    });
    expect(zone(next, P1, 'graveyard')).toEqual([a]);
  });
});

describe('arrangeTop exile, random bottom and shuffle after', () => {
  const arrange = (
    lists: Partial<
      Record<'top' | 'bottom' | 'graveyard' | 'exile' | 'hand', string[]>
    >,
    flags: { bottomRandom?: boolean; shuffleAfter?: boolean } = {}
  ): GameAction => ({
    type: 'arrangeTop',
    playerId: P1,
    top: [],
    bottom: [],
    graveyard: [],
    exile: [],
    hand: [],
    ...lists,
    ...flags,
  });

  it('exiles cards in the order given', () => {
    const state = fresh();
    const [a, b, c] = library(state);
    const next = reduce(state, arrange({ exile: [b, a], top: [c] }));
    expect(zone(next, P1, 'exile')).toEqual([b, a]);
    expect(library(next)[0]).toBe(c);
    expect(library(next)).toHaveLength(8);
  });

  it('puts the bottom cards in an order drawn from state.rng', () => {
    const state = fresh();
    const looked = library(state).slice(0, 6);
    const next = reduce(
      state,
      arrange({ bottom: looked }, { bottomRandom: true })
    );
    const bottom = library(next).slice(-6);
    expect([...bottom].sort()).toEqual([...looked].sort());
    expect(bottom).not.toEqual(looked);
    expect(next.rng).not.toBe(state.rng);
    // The same state and action always give the same order.
    expect(
      library(
        reduce(state, arrange({ bottom: looked }, { bottomRandom: true }))
      ).slice(-6)
    ).toEqual(bottom);
  });

  it('replays a random bottom identically after an undo', () => {
    const state = fresh();
    const looked = library(state).slice(0, 5);
    const arranged = applyAll(state, [
      arrange({ bottom: looked }, { bottomRandom: true }),
      { type: 'shuffle', playerId: P1 },
      { type: 'draw', playerId: P1, count: 1 },
    ]);
    const undone = undoLast(arranged, P1, 1);
    const once = applyAll(state, [
      arrange({ bottom: looked }, { bottomRandom: true }),
      { type: 'shuffle', playerId: P1 },
    ]);
    expect(undone?.state.players).toEqual(once.players);
    expect(undone?.state.rng).toBe(once.rng);
    // Undoing the shuffle too leaves the random bottom as it first was.
    const back = undoLast(undone!.state, P1, 1);
    const first = reduce(
      state,
      arrange({ bottom: looked }, { bottomRandom: true })
    );
    expect(library(back!.state)).toEqual(library(first));
  });

  it('a random bottom is a change even when the order comes out the same', () => {
    // The whole library is looked at, so the bottom is the library.
    const state = deepFreeze(startGame([player(P1, 2)]));
    const both = library(state);
    const next = reduce(
      state,
      arrange({ bottom: both }, { bottomRandom: true })
    );
    expect(next).not.toBe(state);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(next.rng).not.toBe(state.rng);
  });

  it('shuffles the library afterwards, even when nothing moved', () => {
    const state = fresh();
    const [a, b, c] = library(state);
    const next = reduce(
      state,
      arrange({ top: [a, b, c] }, { shuffleAfter: true })
    );
    expect(next).not.toBe(state);
    expect(library(next)).toHaveLength(10);
    expect(library(next)).not.toEqual(library(state));
    expect(next.log.at(-1)).toMatchObject({ shuffleAfter: true });
  });

  it('shuffles only after the hand and graveyard cards left', () => {
    const state = fresh();
    const [a, b, c] = library(state);
    const next = reduce(
      state,
      arrange({ top: [a], hand: [b], graveyard: [c] }, { shuffleAfter: true })
    );
    expect(zone(next, P1, 'hand')).toContain(b);
    expect(zone(next, P1, 'graveyard')).toEqual([c]);
    expect(library(next)).toHaveLength(8);
    expect(library(next)).toContain(a);
  });

  it('refuses an exile list that is not among the top cards', () => {
    const state = fresh();
    const [a, , c] = library(state);
    expect(reduce(state, arrange({ top: [a], exile: [c] }))).toBe(state);
  });
});

describe('searchLibrary', () => {
  const search = (
    state: GameState,
    picks: SearchPick[],
    shuffle = true
  ): GameState =>
    reduce(state, { type: 'searchLibrary', playerId: P1, picks, shuffle });
  const to = (dest: SearchPick['to'], ...ids: string[]): SearchPick[] =>
    ids.map((instanceId) => ({ instanceId, to: dest }));

  it('moves the picks and shuffles the rest', () => {
    const state = fresh();
    const picks = [library(state)[4], library(state)[7]];
    const next = search(state, to('hand', ...picks));
    expect(zone(next, P1, 'hand')).toEqual(picks);
    expect(library(next)).toHaveLength(8);
    expect(library(next)).not.toEqual(
      library(state).filter((id) => !picks.includes(id))
    );
    expect(next.rng).not.toBe(state.rng);
  });

  it('can skip the shuffle', () => {
    const state = fresh();
    const pick = library(state)[3];
    const next = search(state, to('battlefield', pick), false);
    expect(next.cards[pick].zone).toBe('battlefield');
    expect(next.cards[pick].tapped).toBe(false);
    expect(next.cards[pick].position).not.toBeNull();
    expect(library(next)).toEqual(library(state).filter((id) => id !== pick));
    expect(next.rng).toBe(state.rng);
  });

  it('puts cards on top after the shuffle, first pick topmost', () => {
    const state = fresh();
    const [, , x, , y] = library(state);
    const next = search(state, to('top', y, x));
    expect(library(next).slice(0, 2)).toEqual([y, x]);
    expect(library(next)).toHaveLength(10);
  });

  it('puts bottom picks under the shuffled rest, in pick order', () => {
    const state = fresh();
    const [x, , y] = library(state);
    const next = search(state, to('bottom', y, x));
    expect(library(next).slice(-2)).toEqual([y, x]);
    expect(library(next)).toHaveLength(10);
  });

  it('sends each pick to its own destination in one step', () => {
    const state = fresh();
    const [a, b, c, d, e, f, g] = library(state).slice(1);
    const next = search(state, [
      { instanceId: a, to: 'battlefield', tapped: true },
      { instanceId: b, to: 'hand' },
      { instanceId: c, to: 'graveyard' },
      { instanceId: d, to: 'exile' },
      { instanceId: e, to: 'top' },
      { instanceId: f, to: 'bottom' },
      { instanceId: g, to: 'battlefield' },
    ]);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(zone(next, P1, 'battlefield')).toEqual([a, g]);
    expect(next.cards[a].tapped).toBe(true);
    expect(next.cards[g].tapped).toBe(false);
    expect(zone(next, P1, 'hand')).toEqual([b]);
    expect(zone(next, P1, 'graveyard')).toEqual([c]);
    expect(zone(next, P1, 'exile')).toEqual([d]);
    expect(library(next)[0]).toBe(e);
    expect(library(next).at(-1)).toBe(f);
    expect(library(next)).toHaveLength(5);
  });

  it('is the same shuffle whatever the destinations', () => {
    const state = fresh();
    const [a, b] = library(state);
    const rest = (next: GameState) =>
      library(next).filter((id) => id !== a && id !== b);
    const placed = search(state, [
      { instanceId: a, to: 'top' },
      { instanceId: b, to: 'bottom' },
    ]);
    const taken = search(state, to('hand', a, b));
    expect(rest(placed)).toEqual(rest(taken));
  });

  it('ignores tapped off the battlefield', () => {
    const state = fresh();
    const [a] = library(state);
    const next = search(state, [{ instanceId: a, to: 'hand', tapped: true }]);
    expect(next.cards[a].tapped).toBe(false);
  });

  it('finding nothing still shuffles, and nothing at all is a no-op', () => {
    const state = fresh();
    expect(search(state, []).rng).not.toBe(state.rng);
    expect(search(state, [], false)).toBe(state);
  });

  it('refuses cards that are not in the library, or picked twice', () => {
    const state = reduce(fresh(), { type: 'draw', playerId: P1, count: 1 });
    const [inHand] = zone(state, P1, 'hand');
    const [a] = library(state);
    expect(search(state, to('graveyard', a, inHand))).toBe(state);
    expect(
      search(state, [
        { instanceId: a, to: 'top' },
        { instanceId: a, to: 'hand' },
      ])
    ).toBe(state);
  });

  it('a Cultivate is undone in one step', () => {
    const state = fresh();
    const [a, b] = library(state).slice(5);
    const next = search(state, [
      { instanceId: a, to: 'battlefield', tapped: true },
      { instanceId: b, to: 'hand' },
    ]);
    const undone = undoLast(next, P1, 1);
    expect(undone?.action.type).toBe('searchLibrary');
    expect(undone?.state.players).toEqual(state.players);
    expect(undone?.state.cards).toEqual(state.cards);
    expect(undone?.state.rng).toEqual(state.rng);
  });
});

describe('reveal', () => {
  const withHand = () =>
    reduce(fresh(), { type: 'draw', playerId: P1, count: 3 });

  it('reveals the hand, one hand card, or the top of the library', () => {
    const state = withHand();
    const hand = zone(state, P1, 'hand');

    const all = reduce(state, { type: 'reveal', playerId: P1, source: 'hand' });
    expect(all.players[0].revealed).toEqual({
      source: 'hand',
      instanceIds: hand,
    });

    const one = reduce(state, {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: hand[1],
    });
    expect(one.players[0].revealed?.instanceIds).toEqual([hand[1]]);

    const top = reduce(state, {
      type: 'reveal',
      playerId: P1,
      source: 'libraryTop',
      count: 2,
    });
    expect(top.players[0].revealed).toEqual({
      source: 'libraryTop',
      instanceIds: library(state).slice(0, 2),
    });
  });

  it('ignores nothing to reveal and cards outside the hand', () => {
    const state = fresh();
    const [top] = library(state);
    expect(
      reduce(state, { type: 'reveal', playerId: P1, source: 'hand' })
    ).toBe(state);
    expect(
      reduce(state, {
        type: 'reveal',
        playerId: P1,
        source: 'card',
        instanceId: top,
      })
    ).toBe(state);
  });

  it('lasts until hidden or the player does anything else', () => {
    const state = reduce(withHand(), {
      type: 'reveal',
      playerId: P1,
      source: 'hand',
    });
    const hidden = reduce(state, { type: 'hideReveal', playerId: P1 });
    expect(hidden.players[0].revealed).toBeUndefined();
    expect(reduce(hidden, { type: 'hideReveal', playerId: P1 })).toBe(hidden);

    const drew = reduce(state, { type: 'draw', playerId: P1, count: 1 });
    expect(drew.players[0].revealed).toBeUndefined();

    const [card] = zone(state, P1, 'hand');
    const played = reduce(state, {
      type: 'moveCard',
      instanceId: card,
      to: 'battlefield',
    });
    expect(played.players[0].revealed).toBeUndefined();

    // A no-op is not an action, so the reveal stays.
    expect(reduce(state, { type: 'untapAll', playerId: P1 })).toBe(state);
  });

  it('only ends the acting player’s reveal', () => {
    let state = startGame([player('p1', 5), player('p2', 5)]);
    state = applyAll(state, [
      { type: 'draw', playerId: 'p1', count: 1 },
      { type: 'reveal', playerId: 'p1', source: 'hand' },
      { type: 'draw', playerId: 'p2', count: 1 },
    ]);
    expect(state.players[0].revealed).toBeDefined();
  });

  it('a new reveal replaces the old one', () => {
    let state = withHand();
    const hand = zone(state, P1, 'hand');
    state = applyAll(state, [
      { type: 'reveal', playerId: P1, source: 'hand' },
      { type: 'reveal', playerId: P1, source: 'card', instanceId: hand[0] },
    ]);
    expect(state.players[0].revealed).toEqual({
      source: 'card',
      instanceIds: [hand[0]],
    });
    const again = reduce(state, {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: hand[0],
    });
    expect(again).toBe(state);
  });
});

describe('turns', () => {
  it('a game starts on turn 1 in the first main phase', () => {
    expect(fresh().players[0]).toMatchObject({ turn: 1, phase: 'main1' });
    expect(publicView(fresh(), P1)).toMatchObject({
      turn: 1,
      phase: 'main1',
    });
  });

  it('next turn counts up, untaps, and draws when asked', () => {
    let state = reduce(fresh(), { type: 'draw', playerId: P1, count: 1 });
    const [card] = zone(state, P1, 'hand');
    state = applyAll(state, [
      { type: 'moveCard', instanceId: card, to: 'battlefield' },
      { type: 'tap', instanceId: card },
    ]);

    const next = reduce(state, {
      type: 'nextTurn',
      playerId: P1,
      untap: true,
      draw: true,
    });
    expect(next.players[0]).toMatchObject({ turn: 2, phase: 'main1' });
    expect(next.cards[card].tapped).toBe(false);
    expect(zone(next, P1, 'hand')).toHaveLength(1);

    const bare = reduce(state, {
      type: 'nextTurn',
      playerId: P1,
      untap: false,
      draw: false,
    });
    expect(bare.players[0]).toMatchObject({ turn: 2, phase: 'untap' });
    expect(bare.cards[card].tapped).toBe(true);
    expect(zone(bare, P1, 'hand')).toHaveLength(0);

    const untapOnly = reduce(state, {
      type: 'nextTurn',
      playerId: P1,
      untap: true,
      draw: false,
    });
    expect(untapOnly.players[0].phase).toBe('upkeep');
  });

  it('draws nothing from an empty library but still moves on', () => {
    const state = reduce(fresh(), { type: 'mill', playerId: P1, count: 10 });
    const next = reduce(state, {
      type: 'nextTurn',
      playerId: P1,
      untap: true,
      draw: true,
    });
    expect(next.players[0].turn).toBe(2);
  });

  it('sets the phase, ignoring the current one', () => {
    const state = fresh();
    const next = reduce(state, {
      type: 'setPhase',
      playerId: P1,
      phase: 'combat',
    });
    expect(next.players[0].phase).toBe('combat');
    expect(
      reduce(next, { type: 'setPhase', playerId: P1, phase: 'combat' })
    ).toBe(next);
  });
});

describe('parsing library and turn actions', () => {
  it('accepts well-formed actions and drops unknown fields', () => {
    expect(
      parsePlayerAction({ type: 'mill', playerId: P1, count: 2, x: 1 })
    ).toEqual({ type: 'mill', playerId: P1, count: 2 });
    expect(
      parsePlayerAction({
        type: 'arrangeTop',
        playerId: P1,
        top: ['a'],
        bottom: [],
        graveyard: ['b'],
        exile: [],
        hand: [],
      })
    ).toEqual({
      type: 'arrangeTop',
      playerId: P1,
      top: ['a'],
      bottom: [],
      graveyard: ['b'],
      exile: [],
      hand: [],
    });
    expect(
      parsePlayerAction({
        type: 'arrangeTop',
        playerId: P1,
        top: [],
        bottom: ['a', 'b'],
        graveyard: [],
        exile: ['c'],
        hand: [],
        bottomRandom: true,
        shuffleAfter: false,
      })
    ).toEqual({
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: ['a', 'b'],
      graveyard: [],
      exile: ['c'],
      hand: [],
      bottomRandom: true,
    });
    expect(
      parsePlayerAction({
        type: 'searchLibrary',
        playerId: P1,
        picks: [
          { instanceId: 'a', to: 'top', x: 1 },
          { instanceId: 'b', to: 'battlefield', tapped: true },
          { instanceId: 'c', to: 'hand', tapped: true },
          { instanceId: 'd', to: 'bottom', tapped: false },
        ],
        shuffle: true,
      })
    ).toEqual({
      type: 'searchLibrary',
      playerId: P1,
      picks: [
        { instanceId: 'a', to: 'top' },
        { instanceId: 'b', to: 'battlefield', tapped: true },
        { instanceId: 'c', to: 'hand' },
        { instanceId: 'd', to: 'bottom' },
      ],
      shuffle: true,
    });
    expect(
      parsePlayerAction({
        type: 'reveal',
        playerId: P1,
        source: 'libraryTop',
        count: 1,
        instanceId: 'x',
      })
    ).toEqual({ type: 'reveal', playerId: P1, source: 'libraryTop', count: 1 });
    expect(
      parsePlayerAction({
        type: 'reveal',
        playerId: P1,
        source: 'card',
        instanceId: 'x',
      })
    ).toEqual({
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: 'x',
    });
    expect(parsePlayerAction({ type: 'hideReveal', playerId: P1 })).toEqual({
      type: 'hideReveal',
      playerId: P1,
    });
    expect(
      parsePlayerAction({
        type: 'nextTurn',
        playerId: P1,
        untap: true,
        draw: false,
      })
    ).toEqual({ type: 'nextTurn', playerId: P1, untap: true, draw: false });
    expect(
      parsePlayerAction({ type: 'setPhase', playerId: P1, phase: 'end' })
    ).toEqual({ type: 'setPhase', playerId: P1, phase: 'end' });
  });

  it('rejects malformed actions', () => {
    const bad = [
      { type: 'mill', playerId: P1, count: 0 },
      {
        type: 'arrangeTop',
        playerId: P1,
        top: 'a',
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
      },
      {
        type: 'arrangeTop',
        playerId: P1,
        top: [1],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
      },
      // Older callers that leave out the exile list.
      {
        type: 'arrangeTop',
        playerId: P1,
        top: ['a'],
        bottom: [],
        graveyard: [],
        hand: [],
      },
      {
        type: 'arrangeTop',
        playerId: P1,
        top: ['a'],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
        bottomRandom: 'yes',
      },
      {
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: 'a', to: 'command' }],
        shuffle: true,
      },
      {
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: 'a', to: 'library' }],
        shuffle: true,
      },
      {
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: 'a', to: 'hand', tapped: 'yes' }],
        shuffle: true,
      },
      {
        type: 'searchLibrary',
        playerId: P1,
        instanceIds: ['a'],
        to: 'hand',
        shuffle: true,
      },
      { type: 'searchLibrary', playerId: P1, picks: ['a'], shuffle: true },
      { type: 'searchLibrary', playerId: P1, picks: [] },
      { type: 'reveal', playerId: P1, source: 'graveyard' },
      { type: 'reveal', playerId: P1, source: 'libraryTop' },
      { type: 'reveal', playerId: P1, source: 'card' },
      { type: 'nextTurn', playerId: P1, untap: 'yes', draw: true },
      { type: 'setPhase', playerId: P1, phase: 'lunch' },
    ];
    bad.forEach((input) => expect(() => parsePlayerAction(input)).toThrow());
  });
});
