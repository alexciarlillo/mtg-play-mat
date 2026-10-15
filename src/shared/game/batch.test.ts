import { describe, expect, it } from 'vitest';

import { matchesTypes } from './batch';
import { departures, describeDeparture, lentCard } from './control';
import { undoLast } from './history';
import { reduce } from './reducer';
import {
  applyAll,
  cardRef,
  deepFreeze,
  player,
  startGame,
  zone,
} from './testFixtures';
import type { CardRef, GameAction, GameState } from './types';

const P1 = 'p1';

const typed = (name: string, typeLine: string): CardRef => ({
  ...cardRef(name),
  typeLine,
  faces: [{ name, typeLine }],
});

const deck: CardRef[] = [
  typed('Forest', 'Basic Land — Forest'),
  typed('Bear', 'Creature — Bear'),
  typed('Elf', 'Creature — Elf Druid'),
  typed('Ring', 'Artifact'),
  typed('Golem', 'Artifact Creature — Golem'),
  typed('Aura', 'Enchantment — Aura'),
  ...Array.from({ length: 10 }, (_, i) => cardRef(`Spare ${i}`)),
];

const find = (state: GameState, name: string) =>
  Object.values(state.cards).find((card) => card.ref.name === name)!.instanceId;

const names = (state: GameState, ids: string[]) =>
  ids.map((id) => state.cards[id]?.ref.name);

// The six typed cards on the battlefield, the rest left in the library.
const board = (): GameState => {
  const start = startGame([
    player(P1, 0, { deck, command: [cardRef('Cmdr', 'cmdr-id')] }),
  ]);
  const ids = zone(start, P1, 'library').slice(0, 6);
  return applyAll(
    start,
    ids.map((instanceId) => ({
      type: 'moveCard',
      instanceId,
      to: 'battlefield',
    }))
  );
};

const destroyCreatures: GameAction = {
  type: 'moveAll',
  playerId: P1,
  from: 'battlefield',
  to: 'graveyard',
  filter: { types: ['Creature'] },
};

describe('matchesTypes', () => {
  const card = (typeLine: string) => ({
    ref: typed('X', typeLine),
    faceDown: false,
    faceIndex: 0,
    zone: 'battlefield' as const,
  });

  it('matches types before the dash, in any case', () => {
    expect(matchesTypes(card('Artifact Creature — Golem'), {})).toBe(true);
    expect(
      matchesTypes(card('Artifact Creature — Golem'), { types: ['creature'] })
    ).toBe(true);
    expect(
      matchesTypes(card('Artifact Creature — Golem'), {
        excludeTypes: ['Land'],
      })
    ).toBe(true);
    expect(
      matchesTypes(card('Basic Land — Forest'), { excludeTypes: ['Land'] })
    ).toBe(false);
    // A subtype is not a type.
    expect(
      matchesTypes(card('Creature — Forest Dryad'), { types: ['Forest'] })
    ).toBe(false);
  });

  it('reads the face a permanent is showing', () => {
    const ref: CardRef = {
      ...cardRef('Front'),
      typeLine: 'Creature — Human // Land',
      faces: [
        { name: 'Front', typeLine: 'Creature — Human' },
        { name: 'Back', typeLine: 'Land' },
      ],
    };
    const card = { ref, faceDown: false, faceIndex: 1, zone: 'battlefield' };
    expect(matchesTypes(card as never, { types: ['Creature'] })).toBe(false);
    expect(matchesTypes(card as never, { types: ['Land'] })).toBe(true);
  });

  it('counts a face-down permanent as a creature and nothing else', () => {
    const down = { ...card('Basic Land'), faceDown: true };
    expect(matchesTypes(down, { types: ['Creature'] })).toBe(true);
    expect(matchesTypes(down, { excludeTypes: ['Land'] })).toBe(true);
    expect(matchesTypes(down, { types: ['Land'] })).toBe(false);
    // The public view hides its card, which changes nothing.
    expect(matchesTypes({ ...down, ref: null }, { types: ['Creature'] })).toBe(
      true
    );
    expect(
      matchesTypes({ ...down, zone: 'exile' }, { types: ['Creature'] })
    ).toBe(false);
  });
});

describe('moveAll', () => {
  it('moves only the matching permanents, in one logged action', () => {
    const state = deepFreeze(board());
    const next = reduce(state, destroyCreatures);

    expect(names(next, zone(next, P1, 'battlefield'))).toEqual([
      'Forest',
      'Ring',
      'Aura',
    ]);
    expect(names(next, zone(next, P1, 'graveyard'))).toEqual([
      'Bear',
      'Elf',
      'Golem',
    ]);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(next.log.at(-1)).toEqual(destroyCreatures);
  });

  it('is undone in one step', () => {
    const state = board();
    const next = reduce(state, destroyCreatures);
    const undone = undoLast(next, P1, 1);
    expect(undone?.action).toEqual(destroyCreatures);
    expect({ ...undone!.state, seq: 0 }).toEqual({ ...state, seq: 0 });
  });

  it('excludes types, and moves everything without a filter', () => {
    const state = board();
    const nonlands = reduce(state, {
      type: 'moveAll',
      playerId: P1,
      from: 'battlefield',
      to: 'hand',
      filter: { excludeTypes: ['Land'] },
    });
    expect(names(nonlands, zone(nonlands, P1, 'battlefield'))).toEqual([
      'Forest',
    ]);
    expect(zone(nonlands, P1, 'hand')).toHaveLength(5);

    const all = reduce(state, {
      type: 'moveAll',
      playerId: P1,
      from: 'battlefield',
      to: 'exile',
    });
    expect(zone(all, P1, 'battlefield')).toEqual([]);
    expect(zone(all, P1, 'exile')).toEqual(zone(state, P1, 'battlefield'));
  });

  it('moves the whole library in order', () => {
    const state = board();
    const next = reduce(state, {
      type: 'moveAll',
      playerId: P1,
      from: 'library',
      to: 'graveyard',
    });
    expect(zone(next, P1, 'library')).toEqual([]);
    expect(zone(next, P1, 'graveyard')).toEqual(zone(state, P1, 'library'));
  });

  it('changes nothing when nothing matches or the zones are the same', () => {
    const state = board();
    const none = reduce(state, {
      type: 'moveAll',
      playerId: P1,
      from: 'battlefield',
      to: 'graveyard',
      filter: { types: ['Planeswalker'] },
    });
    expect(none).toBe(state);
    expect(
      reduce(state, {
        type: 'moveAll',
        playerId: P1,
        from: 'graveyard',
        to: 'exile',
      })
    ).toBe(state);
    expect(
      reduce(state, {
        type: 'moveAll',
        playerId: P1,
        from: 'battlefield',
        to: 'battlefield',
      })
    ).toBe(state);
  });

  it('treats tokens, attachments, counters and commanders as single moves do', () => {
    let state = board();
    const cmdr = find(state, 'Cmdr');
    state = applyAll(state, [
      {
        type: 'createTokens',
        playerId: P1,
        ref: typed('Soldier', 'Token Creature — Soldier'),
        count: 2,
      },
      { type: 'moveCard', instanceId: cmdr, to: 'battlefield' },
      {
        type: 'attach',
        instanceId: find(state, 'Aura'),
        to: find(state, 'Bear'),
      },
      {
        type: 'adjustCounter',
        instanceId: find(state, 'Elf'),
        counter: '+1/+1',
        delta: 2,
      },
      { type: 'tap', instanceId: find(state, 'Golem') },
    ]);
    const next = reduce(state, destroyCreatures);

    // Tokens cease to exist; the aura stays, unattached.
    expect(
      Object.values(next.cards).filter((card) => card.isToken)
    ).toHaveLength(0);
    expect(next.cards[find(state, 'Aura')]).toMatchObject({
      zone: 'battlefield',
      attachedTo: null,
    });
    expect(next.cards[find(state, 'Elf')].counters).toEqual({});
    expect(next.cards[find(state, 'Golem')].tapped).toBe(false);
    expect(next.cards[cmdr]).toMatchObject({
      zone: 'graveyard',
      isCommander: true,
    });
  });

  it('moves a borrowed permanent out of the game, back to its owner', () => {
    const owner = board();
    const bear = find(owner, 'Bear');
    const taker = reduce(startGame([player('bob', 4)]), {
      type: 'gainControl',
      playerId: 'bob',
      owner: P1,
      card: lentCard(owner.cards[bear]),
    });
    const action: GameAction = {
      type: 'moveAll',
      playerId: 'bob',
      from: 'battlefield',
      to: 'graveyard',
      filter: { types: ['Creature'] },
    };
    const next = reduce(taker, action);
    expect(next.cards[bear]).toBeUndefined();
    expect(departures(taker, action, next).map((d) => d.change)).toEqual([
      expect.objectContaining({
        op: 'return',
        instanceId: bear,
        to: 'graveyard',
      }),
    ]);
  });

  it('sends borrowed permanents put on top home in order', () => {
    const owner = board();
    const [bear, elf] = [find(owner, 'Bear'), find(owner, 'Elf')];
    let taker = startGame([player('bob', 4)]);
    [bear, elf].forEach((id) => {
      taker = reduce(taker, {
        type: 'gainControl',
        playerId: 'bob',
        owner: P1,
        card: lentCard(owner.cards[id]),
      });
    });
    const action: GameAction = {
      type: 'moveCards',
      playerId: 'bob',
      instanceIds: [bear, elf],
      to: 'library',
      index: 0,
    };
    const left = departures(taker, action, reduce(taker, action));
    expect(left.map((d) => [d.card.instanceId, d.change.index])).toEqual([
      [bear, 0],
      [elf, 1],
    ]);
    expect(describeDeparture(left[1], 'Alice')).toBe(
      "put Elf into Alice's library 2nd from the top"
    );
    expect(describeDeparture(left[0], 'Alice')).toBe(
      "put Bear on top of Alice's library"
    );
  });

  it('leaves a lent permanent alone, as its owner cannot move it', () => {
    let state = board();
    const bear = find(state, 'Bear');
    state = reduce(state, { type: 'giveControl', instanceId: bear, to: 'bob' });
    const next = reduce(state, destroyCreatures);
    expect(next.cards[bear]).toMatchObject({
      zone: 'battlefield',
      controller: 'bob',
    });
  });
});

describe('moveCards', () => {
  it('moves the cards in the order given', () => {
    const state = board();
    const [a, b, c] = zone(state, P1, 'battlefield');
    const next = reduce(state, {
      type: 'moveCards',
      playerId: P1,
      instanceIds: [c, a],
      to: 'exile',
    });
    expect(zone(next, P1, 'exile')).toEqual([c, a]);
    expect(zone(next, P1, 'battlefield')).not.toContain(a);
    expect(zone(next, P1, 'battlefield')).toContain(b);
  });

  it('puts cards on top in the order given, the first topmost', () => {
    const state = board();
    const [a, b] = zone(state, P1, 'battlefield');
    const next = reduce(state, {
      type: 'moveCards',
      playerId: P1,
      instanceIds: [a, b],
      to: 'library',
      index: 0,
    });
    expect(zone(next, P1, 'library').slice(0, 2)).toEqual([a, b]);
    const bottom = reduce(state, {
      type: 'moveCards',
      playerId: P1,
      instanceIds: [a, b],
      to: 'library',
    });
    expect(zone(bottom, P1, 'library').slice(-2)).toEqual([a, b]);
  });

  it('can put cards from several zones onto the battlefield tapped', () => {
    let state = board();
    state = reduce(state, { type: 'draw', playerId: P1, count: 2 });
    const [h1, h2] = zone(state, P1, 'hand');
    const next = reduce(state, {
      type: 'moveCards',
      playerId: P1,
      instanceIds: [h1, h2],
      to: 'battlefield',
      tapped: true,
    });
    expect(next.cards[h1]).toMatchObject({ zone: 'battlefield', tapped: true });
    expect(next.cards[h2].position).not.toEqual(next.cards[h1].position);
  });

  it('is refused whole if any card is unknown, repeated or not held', () => {
    const state = board();
    const [a, b] = zone(state, P1, 'battlefield');
    const lent = reduce(state, { type: 'giveControl', instanceId: b, to: 'x' });
    const refused: [GameState, string[]][] = [
      [state, []],
      [state, [a, 'nope']],
      [state, [a, a]],
      [lent, [a, b]],
    ];
    refused.forEach(([s, instanceIds]) => {
      expect(
        reduce(s, { type: 'moveCards', playerId: P1, instanceIds, to: 'hand' })
      ).toBe(s);
    });
    // Another player's cards are not this player's to move.
    const two = startGame([player(P1, 3), player('p2', 3)]);
    const theirs = zone(two, 'p2', 'library');
    expect(
      reduce(two, {
        type: 'moveCards',
        playerId: P1,
        instanceIds: theirs,
        to: 'graveyard',
      })
    ).toBe(two);
  });

  it('skips cards already in the zone', () => {
    const state = reduce(board(), destroyCreatures);
    const [bear] = zone(state, P1, 'graveyard');
    const [forest] = zone(state, P1, 'battlefield');
    expect(
      reduce(state, {
        type: 'moveCards',
        playerId: P1,
        instanceIds: [bear],
        to: 'graveyard',
      })
    ).toBe(state);
    const next = reduce(state, {
      type: 'moveCards',
      playerId: P1,
      instanceIds: [bear, forest],
      to: 'graveyard',
    });
    expect(zone(next, P1, 'graveyard')).toEqual([
      ...zone(state, P1, 'graveyard'),
      forest,
    ]);
  });
});

describe('setTapped', () => {
  it('taps several permanents in one action, skipping tapped ones', () => {
    let state = board();
    const [a, b, c] = zone(state, P1, 'battlefield');
    state = reduce(state, { type: 'tap', instanceId: a });
    const next = reduce(state, {
      type: 'setTapped',
      playerId: P1,
      instanceIds: [a, b, c],
      tapped: true,
    });
    expect([a, b, c].map((id) => next.cards[id].tapped)).toEqual([
      true,
      true,
      true,
    ]);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(
      reduce(next, {
        type: 'setTapped',
        playerId: P1,
        instanceIds: [a, b],
        tapped: true,
      })
    ).toBe(next);
  });

  it('is refused whole unless every card is on the battlefield', () => {
    const state = board();
    const [a] = zone(state, P1, 'battlefield');
    const [lib] = zone(state, P1, 'library');
    expect(
      reduce(state, {
        type: 'setTapped',
        playerId: P1,
        instanceIds: [a, lib],
        tapped: true,
      })
    ).toBe(state);
  });
});

describe('mill', () => {
  it('can exile the top cards instead', () => {
    const state = board();
    const top = zone(state, P1, 'library').slice(0, 3);
    const next = reduce(state, {
      type: 'mill',
      playerId: P1,
      count: 3,
      to: 'exile',
    });
    expect(zone(next, P1, 'exile')).toEqual(top);
    expect(zone(next, P1, 'graveyard')).toEqual([]);
  });
});
