import { describe, expect, it } from 'vitest';

import { describeStep } from './describe';
import { undoLast } from './history';
import { parsePlayerAction } from './validate';
import { reduce } from './reducer';
import {
  describeShowing,
  describeShowingSource,
  parseRevealRequest,
  parseShowingSource,
} from './showing';
import { applyAll, player, startGame, zone } from './testFixtures';
import type { GameAction, GameState } from './types';
import { publicView } from './views';

const P1 = 'p1';

const fail = (message: string): never => {
  throw new Error(message);
};

const opening = (): GameState =>
  applyAll(startGame([player(P1, 20), player('p2', 5)]), [
    { type: 'draw', playerId: P1, count: 5 },
  ]);

const hand = (state: GameState) => zone(state, P1, 'hand');
const library = (state: GameState) => zone(state, P1, 'library');
const nameOf = (state: GameState, id: string) => state.cards[id].ref.name;
const view = (state: GameState) => {
  const v = publicView(state, P1);
  if (!v) throw new Error('no view');
  return v;
};

describe('reveal requests', () => {
  it('reads each source', () => {
    const requests = [
      { to: 'bob', source: 'hand' },
      { to: 'bob', source: 'card', instanceId: 'p1:1' },
      { to: 'bob', source: 'faceDown', instanceId: 'p1:2' },
      { to: 'bob', source: 'libraryTop', count: 3 },
      { to: 'bob', source: 'search', instanceIds: ['p1:3', 'p1:4'] },
    ];
    requests.forEach((request) =>
      expect(parseRevealRequest({ ...request, extra: 1 }, fail, 100)).toEqual(
        request
      )
    );
  });

  it('refuses anything else', () => {
    const bad: unknown[] = [
      null,
      { source: 'hand' },
      { to: 'bob', source: 'graveyard' },
      { to: 'bob', source: 'card' },
      { to: 'bob', source: 'libraryTop', count: 0 },
      { to: 'bob', source: 'libraryTop', count: 101 },
      { to: 'bob', source: 'search', instanceIds: [] },
      { to: 'bob', source: 'search', instanceIds: [1] },
    ];
    bad.forEach((value) =>
      expect(() => parseRevealRequest(value, fail, 100)).toThrow()
    );
  });

  it('names an unknown source "other"', () => {
    expect(parseShowingSource('hand', fail)).toBe('hand');
    expect(parseShowingSource('sideboard', fail)).toBe('other');
    expect(() => parseShowingSource(7, fail)).toThrow();
  });
});

describe('the public line for a reveal to one player', () => {
  it('says who and how many, never which', () => {
    expect(describeShowing('card', 1, 'Bob')).toBe(
      'revealed a card from their hand to Bob'
    );
    expect(describeShowing('hand', 4, 'Bob')).toBe(
      'revealed their hand (4 cards) to Bob'
    );
    expect(describeShowing('libraryTop', 3, 'Bob')).toBe(
      'revealed the top 3 cards of their library to Bob'
    );
    expect(describeShowing('search', 2, 'Bob')).toBe(
      'revealed 2 cards they searched for to Bob'
    );
    expect(describeShowing('faceDown', 1, 'Bob')).toBe(
      'revealed a face-down permanent to Bob'
    );
    expect(describeShowingSource('other', 1)).toBe('a card');
  });
});

describe('revealing a face-down permanent to everyone', () => {
  const faceDown = () => {
    const state = opening();
    const [id] = hand(state);
    return {
      id,
      state: reduce(state, {
        type: 'moveCard',
        instanceId: id,
        to: 'battlefield',
        faceDown: true,
      }),
    };
  };

  it('shows its owner’s card, marked face down, until the next action', () => {
    const { id, state } = faceDown();
    const action: GameAction = {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: id,
    };
    const next = reduce(state, action);
    expect(view(next).revealed).toEqual({
      source: 'card',
      cards: [state.cards[id].ref],
      faceDown: true,
    });
    // The battlefield still hides which card it is.
    expect(view(next).zones.battlefield[0].ref).toBeNull();
    expect(describeStep(state, action, next, P1)).toBe(
      `revealed a face-down permanent: ${nameOf(state, id)}`
    );
    const after = reduce(next, { type: 'adjustLife', playerId: P1, delta: 1 });
    expect(view(after).revealed).toBeNull();
  });

  it('ends once the card is turned face up', () => {
    const { id, state } = faceDown();
    const shown = reduce(state, {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: id,
    });
    expect(view(shown).revealed).not.toBeNull();
    expect(
      view({
        ...shown,
        cards: {
          ...shown.cards,
          [id]: { ...shown.cards[id], faceDown: false },
        },
      }).revealed
    ).toBeNull();
  });

  it('refuses a face-up permanent or someone else’s', () => {
    const state = opening();
    const [id] = hand(state);
    const up = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
    });
    const action: GameAction = {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: id,
    };
    expect(reduce(up, action)).toBe(up);
    const { id: down, state: other } = faceDown();
    const lent = {
      ...other,
      cards: { ...other.cards, [down]: { ...other.cards[down], owner: 'p2' } },
    };
    expect(reduce(lent, { ...action, instanceId: down })).toBe(lent);
  });
});

describe('a search that reveals its picks', () => {
  it('shows every hidden pick, hand and library alike, in one line', () => {
    const state = opening();
    const [a, b, c, d] = library(state);
    const action: GameAction = {
      type: 'searchLibrary',
      playerId: P1,
      picks: [
        { instanceId: a, to: 'hand' },
        { instanceId: b, to: 'top' },
        { instanceId: c, to: 'graveyard' },
        { instanceId: d, to: 'bottom' },
      ],
      shuffle: true,
      reveal: true,
    };
    const next = reduce(state, action);
    // The graveyard pick is public anyway, so it isn't part of the reveal.
    expect(view(next).revealed).toEqual({
      source: 'card',
      cards: [a, b, d].map((id) => state.cards[id].ref),
      search: true,
    });
    expect(describeStep(state, action, next, P1)).toBe(
      `searched their library, revealed ${[a, b, d]
        .map((id) => nameOf(state, id))
        .join(', ')}, then shuffled, and put ${nameOf(state, c)} into ` +
        'their graveyard, a card into their hand, a card on top of their ' +
        'library and a card on the bottom of their library'
    );
    // One action, undone in one step.
    expect(next.log).toHaveLength(state.log.length + 1);
    const undone = undoLast(next, P1, 1);
    expect(undone?.state.players).toEqual(state.players);
  });

  it('shows a card put on top after the shuffle (Mystical Tutor)', () => {
    const state = opening();
    const [, , x] = library(state);
    const action: GameAction = {
      type: 'searchLibrary',
      playerId: P1,
      picks: [{ instanceId: x, to: 'top' }],
      shuffle: true,
      reveal: true,
    };
    const next = reduce(state, action);
    expect(library(next)[0]).toBe(x);
    expect(view(next).revealed).toEqual({
      source: 'card',
      cards: [state.cards[x].ref],
      search: true,
    });
    expect(describeStep(state, action, next, P1)).toBe(
      `searched their library, revealed ${nameOf(state, x)}, then ` +
        'shuffled, and put a card on top of their library'
    );
  });

  it('keeps hand picks unnamed without it, and ends an older reveal', () => {
    const state = reduce(opening(), {
      type: 'reveal',
      playerId: P1,
      source: 'hand',
    });
    const [a] = library(state);
    const quiet: GameAction = {
      type: 'searchLibrary',
      playerId: P1,
      picks: [{ instanceId: a, to: 'hand' }],
      shuffle: false,
    };
    const next = reduce(state, quiet);
    expect(view(next).revealed).toBeNull();
    expect(describeStep(state, quiet, next, P1)).toBe(
      'searched their library and put a card into their hand'
    );
    // Revealing only public picks shows nothing new and ends the old.
    const loud = reduce(state, {
      ...quiet,
      picks: [{ instanceId: a, to: 'exile' }],
      reveal: true,
    });
    expect(view(loud).revealed).toBeNull();
  });
});

describe('validating a revealing search', () => {
  it('keeps the flag only when set', () => {
    const base = {
      type: 'searchLibrary',
      playerId: P1,
      picks: [{ instanceId: 'p1:1', to: 'hand' }],
      shuffle: true,
    };
    expect(parsePlayerAction({ ...base, reveal: true })).toEqual({
      ...base,
      reveal: true,
    });
    expect(parsePlayerAction({ ...base, reveal: false })).toEqual(base);
    expect(parsePlayerAction(base)).toEqual(base);
  });
});
