import { describe, expect, it } from 'vitest';

import { commanderMoves } from './commander';
import { describeStep } from './describe';
import { knownCards, learnFromChange, NO_KNOWLEDGE } from './knownCards';
import { reduce, undoLast } from './index';
import { applyAll, cardRef, player, startGame, zone } from './testFixtures';
import type { GameAction, GameState } from './types';
import { privateView, publicView } from './views';

const sideboard = [cardRef('Wish Target'), cardRef('Spare Bolt')];
const companion = [cardRef('Lurrus')];

const start = (extra = {}) =>
  startGame([player('p1', 20, { sideboard, ...extra })]);

const idOf = (state: GameState, name: string) =>
  Object.values(state.cards).find((card) => card.ref.name === name)!.instanceId;

describe('the sideboard zone', () => {
  it('starts with the deck’s sideboard, outside the library', () => {
    const state = start();
    expect(
      zone(state, 'p1', 'sideboard').map((id) => state.cards[id].ref.name)
    ).toEqual(['Wish Target', 'Spare Bolt']);
    expect(zone(state, 'p1', 'library')).toHaveLength(20);
    expect(state.cards[idOf(state, 'Wish Target')].zone).toBe('sideboard');
  });

  it('stays out of shuffles and mulligans', () => {
    const state = applyAll(start(), [
      { type: 'shuffle', playerId: 'p1' },
      { type: 'draw', playerId: 'p1', count: 7 },
      { type: 'mulligan', playerId: 'p1' },
    ]);
    expect(zone(state, 'p1', 'sideboard')).toHaveLength(2);
    expect(
      zone(state, 'p1', 'hand').length + zone(state, 'p1', 'library').length
    ).toBe(20);
  });

  it('moves to every zone and back', () => {
    let state = start();
    const wish = idOf(state, 'Wish Target');
    for (const to of ['hand', 'battlefield', 'graveyard', 'exile'] as const) {
      state = applyAll(state, [
        { type: 'moveCard', instanceId: wish, to },
        { type: 'moveCard', instanceId: wish, to: 'sideboard' },
      ]);
      expect(state.cards[wish].zone).toBe('sideboard');
    }
    state = reduce(state, {
      type: 'moveCard',
      instanceId: wish,
      to: 'library',
      index: 0,
    });
    expect(zone(state, 'p1', 'library')[0]).toBe(wish);
  });

  it('moves several at once, tapped onto the battlefield, as one step', () => {
    const state = start();
    const ids = zone(state, 'p1', 'sideboard');
    const next = reduce(state, {
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: ids,
      to: 'battlefield',
      tapped: true,
    });
    expect(ids.every((id) => next.cards[id].tapped)).toBe(true);
    expect(next.log).toHaveLength(state.log.length + 1);
    const undone = undoLast(next, 'p1', 1)!.state;
    expect(undone.players).toEqual(state.players);
    expect(undone.cards).toEqual(state.cards);
  });

  it('never takes a borrowed permanent or keeps a token', () => {
    let state = startGame([player('p1', 5, { sideboard }), player('p2', 5)]);
    const theirs = zone(state, 'p2', 'library')[0];
    state = applyAll(state, [
      { type: 'moveCard', instanceId: theirs, to: 'battlefield' },
      {
        type: 'createTokens',
        playerId: 'p1',
        ref: cardRef('Treasure'),
        count: 1,
      },
    ]);
    // Control of another player's card, as a lent permanent arrives.
    state = {
      ...state,
      cards: {
        ...state.cards,
        [theirs]: { ...state.cards[theirs], controller: 'p1' },
      },
      players: state.players.filter((p) => p.id !== 'p2'),
    };
    state = {
      ...state,
      players: state.players.map((p) => ({
        ...p,
        zones: { ...p.zones, battlefield: [...p.zones.battlefield, theirs] },
      })),
    };
    expect(
      reduce(state, { type: 'moveCard', instanceId: theirs, to: 'sideboard' })
    ).toBe(state);
    const own = zone(state, 'p1', 'library')[0];
    expect(
      reduce(state, {
        type: 'moveCards',
        playerId: 'p1',
        instanceIds: [own, theirs],
        to: 'sideboard',
      })
    ).toBe(state);

    const token = zone(state, 'p1', 'battlefield').find(
      (id) => state.cards[id].isToken
    )!;
    const gone = reduce(state, {
      type: 'moveCard',
      instanceId: token,
      to: 'sideboard',
    });
    expect(gone.cards[token]).toBeUndefined();
  });
});

describe('the companion', () => {
  it('starts in the command zone after the commanders, not as one', () => {
    const state = start({ command: [cardRef('Atraxa')], companion });
    const [commander, lurrus] = zone(state, 'p1', 'command');
    expect(state.cards[commander].isCommander).toBe(true);
    expect(state.cards[lurrus].ref.name).toBe('Lurrus');
    expect(state.cards[lurrus].isCommander).toBeUndefined();
    expect(publicView(state, 'p1')?.zones.command[1]).not.toHaveProperty(
      'commanderCasts'
    );
  });

  it('starts in the command zone without a commander too', () => {
    const state = start({ companion });
    const [lurrus] = zone(state, 'p1', 'command');
    expect(state.cards[lurrus].ref.name).toBe('Lurrus');

    // No prompt to send it back, and it keeps no commander state.
    const next = applyAll(state, [
      { type: 'moveCard', instanceId: lurrus, to: 'hand' },
      { type: 'moveCard', instanceId: lurrus, to: 'graveyard' },
    ]);
    expect(commanderMoves(state, next, 'p1')).toEqual([]);
    expect(next.cards[lurrus].isCommander).toBeUndefined();
  });
});

describe('sideboard visibility', () => {
  it('shows others a count only, and the owner every card', () => {
    const state = start({ companion });
    const view = publicView(state, 'p1')!;
    expect(view.sideboardCount).toBe(2);
    const json = JSON.stringify(view);
    for (const card of sideboard) {
      expect(json).not.toContain(card.name);
      expect(json).not.toContain(card.id);
    }
    for (const id of zone(state, 'p1', 'sideboard')) {
      expect(json).not.toContain(JSON.stringify(id));
    }
    expect(
      privateView(state, 'p1')?.sideboard?.map((c) => c.ref?.name)
    ).toEqual(['Wish Target', 'Spare Bolt']);
  });
});

describe('sideboard log lines', () => {
  const line = (state: GameState, action: GameAction) =>
    describeStep(state, action, reduce(state, action), 'p1');

  it('counts hidden moves and names public ones', () => {
    const state = applyAll(start(), [
      { type: 'draw', playerId: 'p1', count: 1 },
    ]);
    const wish = idOf(state, 'Wish Target');
    const [inHand] = zone(state, 'p1', 'hand');
    expect(
      line(state, { type: 'moveCard', instanceId: wish, to: 'hand' })
    ).toBe('put a card from their sideboard into their hand');
    expect(
      line(state, { type: 'moveCard', instanceId: inHand, to: 'sideboard' })
    ).toBe('put a card from their hand into their sideboard');
    expect(
      line(state, { type: 'moveCard', instanceId: wish, to: 'battlefield' })
    ).toBe('put Wish Target onto the battlefield from their sideboard');
    expect(
      line(state, {
        type: 'moveCard',
        instanceId: wish,
        to: 'library',
        index: 0,
      })
    ).toBe('put a card from their sideboard on top of their library');
    expect(
      line(state, {
        type: 'moveCards',
        playerId: 'p1',
        instanceIds: zone(state, 'p1', 'sideboard'),
        to: 'exile',
      })
    ).toBe(
      'put 2 cards from their sideboard into exile: Wish Target and Spare Bolt'
    );
    expect(
      line(state, {
        type: 'moveCards',
        playerId: 'p1',
        instanceIds: zone(state, 'p1', 'sideboard'),
        to: 'hand',
      })
    ).toBe('put 2 cards from their sideboard into their hand');
    expect(line(state, { type: 'shuffleIntoLibrary', instanceId: wish })).toBe(
      'shuffled a card from their sideboard into their library'
    );

    const inGraveyard = applyAll(state, [
      { type: 'moveCard', instanceId: wish, to: 'graveyard' },
    ]);
    expect(
      line(inGraveyard, { type: 'moveCard', instanceId: wish, to: 'sideboard' })
    ).toBe('put Wish Target into their sideboard from their graveyard');
  });
});

describe('sideboard and the known library', () => {
  it('forgets a card sent to the sideboard and knows one put on top', () => {
    const before = start();
    const look: GameAction = {
      type: 'arrangeTop',
      playerId: 'p1',
      top: zone(before, 'p1', 'library').slice(0, 2).reverse(),
      bottom: [],
      graveyard: [],
      exile: [],
      hand: [],
    };
    const steps: GameAction[] = [
      look,
      {
        type: 'moveCard',
        instanceId: zone(before, 'p1', 'library')[1],
        to: 'sideboard',
      },
      {
        type: 'moveCard',
        instanceId: idOf(before, 'Wish Target'),
        to: 'library',
        index: 0,
      },
    ];
    let state = before;
    let known = NO_KNOWLEDGE;
    for (const action of steps) {
      const next = reduce(state, action);
      known = learnFromChange(known, state, next, 'p1');
      state = next;
    }
    const top = knownCards(state, 'p1', known).top.map((c) => c.ref.name);
    const second = state.cards[zone(before, 'p1', 'library')[0]].ref.name;
    expect(top).toEqual(['Wish Target', second]);
  });
});
