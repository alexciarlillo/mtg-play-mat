import { describe, expect, it } from 'vitest';

import { describeStep } from './describe';
import { undoLast } from './history';
import { reduce } from './reducer';
import { applyAll, deepFreeze, player, startGame, zone } from './testFixtures';
import type { GameAction, GameState } from './types';
import { parsePlayerAction } from './validate';
import { publicView } from './views';

const P1 = 'p1';

// p1 0 is on top of an unshuffled ten-card library.
const fresh = () => deepFreeze(startGame([player(P1, 10)]));

const library = (state: GameState) => zone(state, P1, 'library');

const revealTop = (count: number): GameAction => ({
  type: 'reveal',
  playerId: P1,
  source: 'libraryTop',
  count,
});

const topRevealed = (revealed: boolean): GameAction => ({
  type: 'setTopRevealed',
  playerId: P1,
  revealed,
});

const names = (state: GameState) =>
  publicView(state, P1)?.revealed?.cards.map((ref) => ref.name);

const line = (before: GameState, action: GameAction) =>
  describeStep(before, action, reduce(before, action), P1);

describe('revealing until a hit', () => {
  it('each reveal of one more card keeps the earlier ones shown', () => {
    const one = reduce(fresh(), revealTop(1));
    const two = reduce(one, revealTop(2));
    const three = reduce(two, revealTop(3));
    expect(names(three)).toEqual(['p1 0', 'p1 1', 'p1 2']);
    expect(three.log.slice(-3)).toEqual([
      revealTop(1),
      revealTop(2),
      revealTop(3),
    ]);
  });

  it('logs each card as the next one, with the total so far', () => {
    const one = reduce(fresh(), revealTop(1));
    expect(line(fresh(), revealTop(1))).toBe(
      'revealed the top card of their library: p1 0'
    );
    expect(line(one, revealTop(2))).toBe(
      'revealed the next card of their library (2 so far): p1 1'
    );
    expect(line(one, revealTop(4))).toBe(
      'revealed the next 3 cards of their library (4 so far): p1 1, p1 2, p1 3'
    );
  });

  it('a cascade finishes with the hit in hand and the rest at random', () => {
    const shown = applyAll(fresh(), [revealTop(1), revealTop(2), revealTop(3)]);
    const [a, b, hit] = library(shown);
    const finish: GameAction = {
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: [a, b],
      graveyard: [],
      exile: [],
      hand: [hit],
      bottomRandom: true,
    };
    const done = reduce(shown, finish);
    expect(zone(done, P1, 'hand')).toEqual([hit]);
    expect([...library(done).slice(-2)].sort()).toEqual([a, b].sort());
    expect(library(done)).toHaveLength(9);
    // Finishing is an action, so the reveal is over.
    expect(done.players[0].revealed).toBeUndefined();
    expect(line(shown, finish)).toBe(
      'finished revealing 3 cards from their library: ' +
        '2 on the bottom in a random order, a card into their hand'
    );

    // One undo takes back the finish and shows the three cards again;
    // each further undo takes back one reveal.
    const undone = undoLast(done, P1, 1)!;
    expect(names(undone.state)).toEqual(['p1 0', 'p1 1', 'p1 2']);
    const back = undoLast(undone.state, P1, 1)!;
    expect(names(back.state)).toEqual(['p1 0', 'p1 1']);
  });

  it('can put the hit onto the battlefield and the rest into the graveyard', () => {
    const shown = reduce(fresh(), revealTop(3));
    const [a, b, hit] = library(shown);
    const finish: GameAction = {
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: [],
      graveyard: [a, b],
      exile: [],
      hand: [],
      battlefield: [hit],
    };
    const done = reduce(shown, finish);
    expect(zone(done, P1, 'battlefield')).toEqual([hit]);
    expect(done.cards[hit].position).not.toBeNull();
    expect(zone(done, P1, 'graveyard')).toEqual([a, b]);
    expect(line(shown, finish)).toBe(
      'finished revealing 3 cards from their library: ' +
        'p1 0, p1 1 into their graveyard, p1 2 onto the battlefield'
    );
  });

  it('never reveals more than peers accept, however it is asked', () => {
    const big = deepFreeze(startGame([player(P1, 150)]));
    const revealedCount = (state: GameState) =>
      state.players[0].revealed?.instanceIds.length;
    expect(revealedCount(reduce(big, revealTop(150)))).toBe(100);
    // The validator clamps, as it does other counts.
    expect(parsePlayerAction(revealTop(500))).toEqual(revealTop(100));
    expect(parsePlayerAction(revealTop(7))).toEqual(revealTop(7));
  });

  it('a later look of the same size is still a look, not a reveal', () => {
    const shown = reduce(fresh(), revealTop(2));
    const [a, b] = library(shown);
    const scry: GameAction = {
      type: 'arrangeTop',
      playerId: P1,
      top: [a],
      bottom: [b],
      graveyard: [],
      exile: [],
      hand: [],
    };
    expect(line(shown, scry)).toBe(
      'looked at the top 2 cards of their library: 1 on top, 1 on the bottom'
    );
  });

  it('refuses a battlefield card that is not among the top cards', () => {
    const state = fresh();
    const lib = library(state);
    expect(
      reduce(state, {
        type: 'arrangeTop',
        playerId: P1,
        top: [lib[0]],
        bottom: [],
        graveyard: [],
        exile: [],
        hand: [],
        battlefield: [lib[5]],
      })
    ).toBe(state);
  });

  it('parses a battlefield list, leaving out an empty one', () => {
    const base = {
      type: 'arrangeTop',
      playerId: P1,
      top: [],
      bottom: ['a'],
      graveyard: [],
      exile: [],
      hand: [],
    };
    expect(parsePlayerAction({ ...base, battlefield: ['b'] })).toEqual({
      ...base,
      battlefield: ['b'],
    });
    expect(parsePlayerAction({ ...base, battlefield: [] })).toEqual(base);
    expect(parsePlayerAction(base)).toEqual(base);
    expect(() => parsePlayerAction({ ...base, battlefield: 'b' })).toThrow();
  });
});

describe('playing with the top card revealed', () => {
  it('shows the top card in the public view only while on', () => {
    const state = fresh();
    expect(publicView(state, P1)).not.toHaveProperty('topCard');
    const on = reduce(state, topRevealed(true));
    expect(on.players[0].topRevealed).toBe(true);
    expect(publicView(on, P1)?.topCard?.name).toBe('p1 0');
    const off = reduce(on, topRevealed(false));
    expect(off.players[0]).not.toHaveProperty('topRevealed');
    expect(publicView(off, P1)).not.toHaveProperty('topCard');
  });

  it('turning it on twice, or off while off, is a no-op', () => {
    const state = fresh();
    expect(reduce(state, topRevealed(false))).toBe(state);
    const on = reduce(state, topRevealed(true));
    expect(reduce(on, topRevealed(true))).toBe(on);
  });

  it('survives other actions and follows draws, shuffles and looks', () => {
    const on = reduce(fresh(), topRevealed(true));
    const top = (state: GameState) => publicView(state, P1)?.topCard?.name;

    const drew = reduce(on, { type: 'draw', playerId: P1, count: 2 });
    expect(top(drew)).toBe('p1 2');

    const shuffled = reduce(drew, { type: 'shuffle', playerId: P1 });
    const first = shuffled.cards[library(shuffled)[0]].ref.name;
    expect(top(shuffled)).toBe(first);

    const [x, y] = library(shuffled);
    const arranged = reduce(shuffled, {
      type: 'arrangeTop',
      playerId: P1,
      top: [y, x],
      bottom: [],
      graveyard: [],
      exile: [],
      hand: [],
    });
    expect(top(arranged)).toBe(arranged.cards[y].ref.name);

    // A reveal ends at the next action; playing with the top revealed
    // doesn't.
    const revealed = reduce(arranged, revealTop(1));
    const after = reduce(revealed, { type: 'untapAll', playerId: P1 });
    expect(after).toBe(revealed);
    const milled = reduce(revealed, { type: 'mill', playerId: P1, count: 1 });
    expect(milled.players[0].revealed).toBeUndefined();
    expect(milled.players[0].topRevealed).toBe(true);
  });

  it('is null on an empty library, and gone in a new game', () => {
    const empty = applyAll(fresh(), [
      topRevealed(true),
      { type: 'mill', playerId: P1, count: 10 },
    ]);
    expect(publicView(empty, P1)?.topCard).toBeNull();
    const again = reduce(empty, {
      type: 'newGame',
      seed: 1,
      players: [{ id: P1, name: P1, deck: [] }],
    });
    expect(again.players[0]).not.toHaveProperty('topRevealed');
  });

  it('is undone and logged like any other action', () => {
    const state = fresh();
    const on = reduce(state, topRevealed(true));
    expect(undoLast(on, P1, 1)?.state.players[0]).not.toHaveProperty(
      'topRevealed'
    );
    expect(line(state, topRevealed(true))).toBe(
      'started playing with the top card of their library revealed'
    );
    expect(line(on, topRevealed(false))).toBe(
      'stopped playing with the top card of their library revealed'
    );
  });

  it('parses the toggle', () => {
    expect(parsePlayerAction({ ...topRevealed(true), extra: 1 })).toEqual(
      topRevealed(true)
    );
    expect(() =>
      parsePlayerAction({ type: 'setTopRevealed', playerId: P1 })
    ).toThrow();
  });
});
