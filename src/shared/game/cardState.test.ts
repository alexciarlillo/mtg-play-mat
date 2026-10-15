import { describe, expect, it } from 'vitest';

import { lentCard, permanentState } from './control';
import { describeStep } from './describe';
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
import { InvalidActionError, parsePlayerAction } from './validate';
import { publicView } from './views';

const P1 = 'p1';
const P2 = 'p2';

const typed = (name: string, typeLine: string): CardRef => ({
  ...cardRef(name),
  typeLine,
  faces: [{ name, typeLine }],
});

const deck: CardRef[] = [
  cardRef('Bear'),
  typed('Forest', 'Basic Land — Forest'),
  cardRef('Elf'),
  ...Array.from({ length: 10 }, (_, i) => cardRef(`Spare ${i}`)),
];

const find = (state: GameState, name: string) =>
  Object.values(state.cards).find((card) => card.ref.name === name)!.instanceId;

// Bear, Forest and Elf on the battlefield, all tapped.
const board = (): GameState => {
  const start = startGame([player(P1, 0, { deck }), player(P2, 3)]);
  const ids = zone(start, P1, 'library').slice(0, 3);
  return applyAll(start, [
    ...ids.map((instanceId): GameAction => ({
      type: 'moveCard',
      instanceId,
      to: 'battlefield',
      tapped: true,
    })),
  ]);
};

const set = (
  state: GameState,
  names: string[],
  patch: Partial<Extract<GameAction, { type: 'setCardState' }>>
) =>
  reduce(state, {
    type: 'setCardState',
    playerId: P1,
    instanceIds: names.map((name) => find(state, name)),
    ...patch,
  });

describe('setCardState', () => {
  it('marks several permanents in one logged step', () => {
    const before = deepFreeze(board());
    const after = set(before, ['Bear', 'Forest'], { doesntUntap: true });
    expect(after.cards[find(after, 'Bear')].doesntUntap).toBe(true);
    expect(after.cards[find(after, 'Forest')].doesntUntap).toBe(true);
    expect(after.cards[find(after, 'Elf')].doesntUntap).toBeUndefined();
    expect(after.log.length).toBe(before.log.length + 1);
  });

  it('takes a field off again instead of storing false', () => {
    const marked = set(board(), ['Bear'], { doesntUntap: true });
    const cleared = set(marked, ['Bear'], { doesntUntap: false });
    expect('doesntUntap' in cleared.cards[find(cleared, 'Bear')]).toBe(false);
  });

  it('sets and resets base power and toughness', () => {
    const big = set(board(), ['Forest'], {
      ptOverride: { power: 3, toughness: 4 },
    });
    expect(big.cards[find(big, 'Forest')].ptOverride).toEqual({
      power: 3,
      toughness: 4,
    });
    const back = set(big, ['Forest'], { ptOverride: null });
    expect('ptOverride' in back.cards[find(back, 'Forest')]).toBe(false);
  });

  it('adds and removes abilities without duplicates', () => {
    const one = set(board(), ['Bear'], { addAbilities: ['flying'] });
    const two = set(one, ['Bear', 'Elf'], {
      addAbilities: ['Flying', 'goaded', 'goaded'],
    });
    expect(two.cards[find(two, 'Bear')].abilities).toEqual([
      'flying',
      'goaded',
    ]);
    expect(two.cards[find(two, 'Elf')].abilities).toEqual(['Flying', 'goaded']);
    const gone = set(two, ['Bear', 'Elf'], {
      removeAbilities: ['FLYING', 'goaded'],
    });
    expect('abilities' in gone.cards[find(gone, 'Bear')]).toBe(false);
  });

  it('changes nothing for a no-op, and refuses cards off the battlefield', () => {
    const state = board();
    expect(set(state, ['Bear'], { doesntUntap: false })).toBe(state);
    const library = zone(state, P1, 'library')[0];
    expect(
      reduce(state, {
        type: 'setCardState',
        playerId: P1,
        instanceIds: [find(state, 'Bear'), library],
        doesntUntap: true,
      })
    ).toBe(state);
    expect(
      reduce(state, {
        type: 'setCardState',
        playerId: P2,
        instanceIds: [find(state, 'Bear')],
        doesntUntap: true,
      })
    ).toBe(state);
  });

  it('is undone as one step', () => {
    const state = board();
    const after = set(state, ['Bear', 'Elf'], {
      doesntUntap: true,
      ptOverride: { power: 5, toughness: 5 },
      addAbilities: ['trample'],
    });
    const undone = undoLast(after, P1, state.log.length);
    expect(undone?.state.cards).toEqual(state.cards);
  });
});

describe("doesn't untap", () => {
  const marked = () => set(board(), ['Bear'], { doesntUntap: true });

  it('stays tapped through untap all', () => {
    const state = reduce(marked(), { type: 'untapAll', playerId: P1 });
    expect(state.cards[find(state, 'Bear')].tapped).toBe(true);
    expect(state.cards[find(state, 'Elf')].tapped).toBe(false);
  });

  it('stays tapped through the next turn', () => {
    const state = reduce(marked(), {
      type: 'nextTurn',
      playerId: P1,
      untap: true,
      draw: true,
    });
    expect(state.cards[find(state, 'Bear')].tapped).toBe(true);
    expect(state.cards[find(state, 'Forest')].tapped).toBe(false);
  });

  it('can still be untapped by hand', () => {
    const state = marked();
    const after = reduce(state, {
      type: 'untap',
      instanceId: find(state, 'Bear'),
    });
    expect(after.cards[find(after, 'Bear')].tapped).toBe(false);
  });
});

describe('leaving the battlefield', () => {
  it('clears every hand-set field, like counters', () => {
    const state = set(board(), ['Bear'], {
      doesntUntap: true,
      ptOverride: { power: 4, toughness: 4 },
      addAbilities: ['haste'],
    });
    const bear = find(state, 'Bear');
    const bounced = reduce(state, {
      type: 'moveCard',
      instanceId: bear,
      to: 'hand',
    });
    const card = bounced.cards[bear];
    expect(card.doesntUntap).toBeUndefined();
    expect(card.ptOverride).toBeUndefined();
    expect(card.abilities).toBeUndefined();
    const back = reduce(bounced, {
      type: 'moveCard',
      instanceId: bear,
      to: 'battlefield',
    });
    expect(back.cards[bear].abilities).toBeUndefined();
  });

  it('is not copied onto a token copy', () => {
    const state = set(board(), ['Bear'], { addAbilities: ['flying'] });
    const copied = reduce(state, {
      type: 'copyCard',
      instanceId: find(state, 'Bear'),
    });
    const token = Object.values(copied.cards).find((card) => card.isToken)!;
    expect(token.abilities).toBeUndefined();
  });
});

describe('views', () => {
  it('shows the fields publicly, and only when set', () => {
    const state = set(board(), ['Bear'], {
      doesntUntap: true,
      ptOverride: { power: 0, toughness: 1 },
      addAbilities: ['goaded'],
    });
    const view = publicView(state, P1)!;
    const bear = view.zones.battlefield.find((c) => c.ref?.name === 'Bear')!;
    expect(bear).toMatchObject({
      doesntUntap: true,
      ptOverride: { power: 0, toughness: 1 },
      abilities: ['goaded'],
    });
    const elf = view.zones.battlefield.find((c) => c.ref?.name === 'Elf')!;
    expect(Object.keys(elf)).not.toContain('abilities');
    expect(Object.keys(elf)).not.toContain('ptOverride');
    expect(Object.keys(elf)).not.toContain('doesntUntap');
  });
});

describe('control', () => {
  it('carries the fields with a lent permanent', () => {
    const state = set(board(), ['Bear'], {
      doesntUntap: true,
      ptOverride: { power: 2, toughness: 3 },
      addAbilities: ['menace'],
    });
    const card = state.cards[find(state, 'Bear')];
    expect(lentCard(card)).toMatchObject({
      doesntUntap: true,
      ptOverride: { power: 2, toughness: 3 },
      abilities: ['menace'],
    });
    expect(Object.keys(permanentState(board().cards[card.instanceId]))).toEqual(
      ['tapped', 'faceDown', 'faceIndex', 'counters']
    );
  });
});

describe('mana pool', () => {
  const pooled = () =>
    applyAll(board(), [
      {
        type: 'adjustPlayerCounter',
        playerId: P1,
        counter: 'mana:G',
        delta: 2,
      },
      {
        type: 'adjustPlayerCounter',
        playerId: P1,
        counter: 'poison',
        delta: 1,
      },
    ]);
  const counters = (state: GameState) =>
    state.players.find((p) => p.id === P1)!.counters;

  it('empties only the mana counters', () => {
    const state = reduce(pooled(), { type: 'emptyManaPool', playerId: P1 });
    expect(counters(state)).toEqual({ poison: 1 });
    expect(reduce(state, { type: 'emptyManaPool', playerId: P1 })).toBe(state);
  });

  it('empties on a step or turn change only when asked', () => {
    const kept = reduce(pooled(), {
      type: 'setPhase',
      playerId: P1,
      phase: 'combat',
    });
    expect(counters(kept)['mana:G']).toBe(2);
    const emptied = reduce(pooled(), {
      type: 'setPhase',
      playerId: P1,
      phase: 'combat',
      emptyMana: true,
    });
    expect(counters(emptied)).toEqual({ poison: 1 });
    const turned = reduce(pooled(), {
      type: 'nextTurn',
      playerId: P1,
      untap: false,
      draw: false,
      emptyMana: true,
    });
    expect(counters(turned)).toEqual({ poison: 1 });
  });

  it('logs no line per pip, but one for emptying', () => {
    const state = board();
    const add: GameAction = {
      type: 'adjustPlayerCounter',
      playerId: P1,
      counter: 'mana:W',
      delta: 1,
    };
    const after = reduce(state, add);
    expect(describeStep(state, add, after, P1)).toBeNull();
    const empty: GameAction = { type: 'emptyManaPool', playerId: P1 };
    expect(describeStep(after, empty, reduce(after, empty), P1)).toBe(
      'emptied their mana pool'
    );
  });
});

describe('log lines', () => {
  const line = (
    state: GameState,
    names: string[],
    patch: Partial<Extract<GameAction, { type: 'setCardState' }>>
  ) => {
    const action: GameAction = {
      type: 'setCardState',
      playerId: P1,
      instanceIds: names.map((name) => find(state, name)),
      ...patch,
    };
    return describeStep(state, action, reduce(state, action), P1);
  };

  it('tells only what changed, not what was asked for', () => {
    const state = set(board(), ['Bear'], {
      doesntUntap: true,
      addAbilities: ['flying'],
    });
    expect(
      line(state, ['Bear', 'Elf'], {
        doesntUntap: true,
        addAbilities: ['Flying', 'haste'],
      })
    ).toBe(
      'marked Elf as not untapping, gave Bear haste and gave Elf Flying and haste'
    );
    expect(
      line(state, ['Bear', 'Elf'], { removeAbilities: ['flying', 'reach'] })
    ).toBe('removed flying from Bear');
    expect(line(state, ['Forest', 'Elf'], { doesntUntap: false })).toBeNull();
  });

  it('names the card, or counts a group', () => {
    const state = board();
    expect(line(state, ['Bear'], { doesntUntap: true })).toBe(
      'marked Bear as not untapping'
    );
    expect(line(state, ['Bear', 'Elf'], { addAbilities: ['flying'] })).toBe(
      'gave 2 permanents flying'
    );
    expect(
      line(state, ['Forest'], { ptOverride: { power: 0, toughness: 0 } })
    ).toBe('made Forest a 0/0 creature');
    expect(
      line(state, ['Bear'], { ptOverride: { power: 3, toughness: 3 } })
    ).toBe('set Bear to base 3/3');
  });
});

describe('validation', () => {
  const parse = (input: object) =>
    parsePlayerAction({
      type: 'setCardState',
      playerId: P1,
      instanceIds: ['p1:0'],
      ...input,
    });

  it('keeps known fields only, trimmed', () => {
    expect(
      parse({ addAbilities: ['  flying '], ptOverride: null, junk: 1 })
    ).toEqual({
      type: 'setCardState',
      playerId: P1,
      instanceIds: ['p1:0'],
      ptOverride: null,
      addAbilities: ['flying'],
    });
  });

  it('strips control and bidi characters, and dedupes in any case', () => {
    expect(
      parse({ addAbilities: ['fly\u202eing', 'Flying', 'a\u0007b'] })
    ).toMatchObject({ addAbilities: ['flying', 'ab'] });
    expect(() => parse({ addAbilities: ['\u202e\u2066'] })).toThrow(
      InvalidActionError
    );
  });

  it('takes more removals than one card holds, for a selection', () => {
    const many = Array.from({ length: 14 }, (_, i) => `ability ${i}`);
    expect(parse({ removeAbilities: many })).toMatchObject({
      removeAbilities: many,
    });
    expect(() => parse({ addAbilities: many })).toThrow(InvalidActionError);
  });

  it('refuses an empty change and bad values', () => {
    expect(() => parse({})).toThrow(InvalidActionError);
    expect(() => parse({ ptOverride: { power: 1.5, toughness: 1 } })).toThrow(
      InvalidActionError
    );
    expect(() => parse({ ptOverride: { power: 1000, toughness: 1 } })).toThrow(
      InvalidActionError
    );
    expect(() => parse({ addAbilities: ['x'.repeat(31)] })).toThrow(
      InvalidActionError
    );
    expect(() => parse({ addAbilities: Array(13).fill('a') })).toThrow(
      InvalidActionError
    );
  });

  it('keeps emptyMana only when set', () => {
    expect(
      parsePlayerAction({
        type: 'setPhase',
        playerId: P1,
        phase: 'end',
        emptyMana: false,
      })
    ).toEqual({ type: 'setPhase', playerId: P1, phase: 'end' });
    expect(
      parsePlayerAction({
        type: 'nextTurn',
        playerId: P1,
        untap: true,
        draw: true,
        emptyMana: true,
      })
    ).toMatchObject({ emptyMana: true });
  });
});
