import { describe, expect, it } from 'vitest';

import { redoAction, undoLast } from './history';
import { reduce } from './reducer';
import { applyAll, cardRef, player, startGame, zone } from './testFixtures';
import type { CardRef, GameState, PlayerAction } from './types';

const P1 = 'p1';

// seq only orders views; everything else must match exactly.
const comparable = (state: GameState) => ({ ...state, seq: 0 });

const delver: CardRef = {
  id: 'id-delver',
  name: 'Delver',
  typeLine: 'Creature — Human Wizard',
  layout: 'transform',
  faces: [
    { name: 'Delver', typeLine: 'Creature — Human Wizard' },
    { name: 'Insectile Aberration', typeLine: 'Creature — Human Insect' },
  ],
};

// A game set up the way a play test starts one: shuffle, then seven.
const setUp = () => {
  const deck = [
    ...Array.from({ length: 20 }, (_, i) => cardRef(`c${i}`)),
    delver,
  ];
  const state = applyAll(
    startGame([player(P1, 0, { deck, command: [cardRef('Cmdr', 'cmdr-id')] })]),
    [
      { type: 'shuffle', playerId: P1 },
      { type: 'draw', playerId: P1, count: 7 },
    ]
  );
  return { state, floor: state.log.length };
};

const hand = (s: GameState) => zone(s, P1, 'hand');
const field = (s: GameState) => zone(s, P1, 'battlefield');
const lib = (s: GameState) => zone(s, P1, 'library');
const find = (s: GameState, name: string) =>
  Object.values(s.cards).find((c) => c.ref.name === name)!.instanceId;

// One step per action type; each must change the state it is given.
const steps: Record<PlayerAction['type'], (s: GameState) => PlayerAction> = {
  mulligan: () => ({ type: 'mulligan', playerId: P1 }),
  keepHand: (s) => ({ type: 'keepHand', playerId: P1, bottom: [hand(s)[0]] }),
  shuffle: () => ({ type: 'shuffle', playerId: P1 }),
  draw: () => ({ type: 'draw', playerId: P1, count: 2 }),
  moveCard: (s) => ({
    type: 'moveCard',
    instanceId: hand(s)[0],
    to: 'battlefield',
  }),
  setPosition: (s) => ({
    type: 'setPosition',
    instanceId: field(s)[0],
    position: { x: 300, y: 100 },
  }),
  tap: (s) => ({ type: 'tap', instanceId: field(s)[0] }),
  untap: (s) => ({ type: 'untap', instanceId: field(s)[0] }),
  toggleTap: (s) => ({ type: 'toggleTap', instanceId: field(s)[0] }),
  untapAll: () => ({ type: 'untapAll', playerId: P1 }),
  shuffleIntoLibrary: (s) => ({
    type: 'shuffleIntoLibrary',
    instanceId: hand(s)[0],
  }),
  adjustLife: () => ({ type: 'adjustLife', playerId: P1, delta: -3 }),
  setLife: () => ({ type: 'setLife', playerId: P1, life: 7 }),
  adjustCounter: (s) => ({
    type: 'adjustCounter',
    instanceId: field(s)[0],
    counter: '+1/+1',
    delta: 2,
  }),
  adjustPlayerCounter: () => ({
    type: 'adjustPlayerCounter',
    playerId: P1,
    counter: 'poison',
    delta: 1,
  }),
  createTokens: () => ({
    type: 'createTokens',
    playerId: P1,
    ref: cardRef('Soldier'),
    count: 2,
  }),
  copyCard: (s) => ({ type: 'copyCard', instanceId: field(s)[0] }),
  setFaceDown: (s) => ({
    type: 'setFaceDown',
    instanceId: field(s)[0],
    faceDown: true,
  }),
  transform: (s) => ({ type: 'transform', instanceId: find(s, 'Delver') }),
  attach: (s) => ({
    type: 'attach',
    instanceId: field(s)[1],
    to: field(s)[0],
  }),
  adjustCommanderCasts: (s) => ({
    type: 'adjustCommanderCasts',
    instanceId: find(s, 'Cmdr'),
    delta: 1,
  }),
  adjustCommanderDamage: () => ({
    type: 'adjustCommanderDamage',
    playerId: P1,
    source: 'someone',
    sourceName: 'Someone',
    delta: 3,
  }),
  addDummy: () => ({ type: 'addDummy', playerId: P1, name: 'Dummy' }),
  adjustDummyLife: () => ({
    type: 'adjustDummyLife',
    playerId: P1,
    dummyId: 'dummy-1',
    delta: -2,
  }),
  removeDummy: () => ({
    type: 'removeDummy',
    playerId: P1,
    dummyId: 'dummy-1',
  }),
  mill: () => ({ type: 'mill', playerId: P1, count: 2 }),
  arrangeTop: (s) => {
    const [a, b, c] = lib(s);
    return {
      type: 'arrangeTop',
      playerId: P1,
      top: [b],
      bottom: [a],
      graveyard: [c],
      hand: [],
    };
  },
  searchLibrary: (s) => ({
    type: 'searchLibrary',
    playerId: P1,
    instanceIds: [lib(s)[3]],
    to: 'hand',
    shuffle: true,
  }),
  reveal: () => ({ type: 'reveal', playerId: P1, source: 'hand' }),
  hideReveal: () => ({ type: 'hideReveal', playerId: P1 }),
  nextTurn: () => ({
    type: 'nextTurn',
    playerId: P1,
    untap: true,
    draw: true,
  }),
  setPhase: () => ({ type: 'setPhase', playerId: P1, phase: 'combat' }),
};

// An order in which every step does something.
const order: PlayerAction['type'][] = [
  'mulligan',
  'keepHand',
  'shuffle',
  'draw',
  'moveCard',
  'setPosition',
  'tap',
  'untap',
  'toggleTap',
  'untapAll',
  'shuffleIntoLibrary',
  'adjustLife',
  'setLife',
  'adjustCounter',
  'adjustPlayerCounter',
  'createTokens',
  'copyCard',
  'attach',
  'setFaceDown',
  'transform',
  'adjustCommanderCasts',
  'adjustCommanderDamage',
  'addDummy',
  'adjustDummyLife',
  'removeDummy',
  'mill',
  'arrangeTop',
  'searchLibrary',
  'reveal',
  'hideReveal',
  'nextTurn',
  'setPhase',
];

describe('undo and redo', () => {
  it('covers every player action type', () => {
    expect([...order].sort()).toEqual(Object.keys(steps).sort());
  });

  it('undoes any single action exactly, and redo re-applies it', () => {
    let { state } = setUp();
    const { floor } = setUp();
    // The Delver must be on the battlefield before transform.
    state = reduce(state, {
      type: 'moveCard',
      instanceId: find(state, 'Delver'),
      to: 'battlefield',
      position: { x: 500, y: 0 },
    });

    order.forEach((type) => {
      const action = steps[type](state);
      const after = reduce(state, action);
      expect(after, type).not.toBe(state);

      const undone = undoLast(after, P1, floor);
      expect(undone?.action, type).toEqual(action);
      expect(comparable(undone!.state), type).toEqual(comparable(state));
      expect(undone!.state.seq, type).toBe(after.seq + 1);

      const redone = redoAction(undone!.state, undone!.action);
      expect(comparable(redone!), type).toEqual(comparable(after));
      state = after;
    });
  });

  it('undo after a shuffle restores the library order', () => {
    const { state, floor } = setUp();
    const shuffled = reduce(state, { type: 'shuffle', playerId: P1 });
    expect(lib(shuffled)).not.toEqual(lib(state));

    const undone = undoLast(shuffled, P1, floor);
    expect(lib(undone!.state)).toEqual(lib(state));
    expect(undone!.state.rng).toBe(state.rng);
    // The same shuffle happens again on redo.
    expect(lib(redoAction(undone!.state, undone!.action)!)).toEqual(
      lib(shuffled)
    );
  });

  it('walks back several steps and forward again', () => {
    const { state: start, floor } = setUp();
    const actions: PlayerAction[] = [
      { type: 'draw', playerId: P1, count: 1 },
      { type: 'shuffle', playerId: P1 },
      { type: 'mill', playerId: P1, count: 3 },
    ];
    const states = [start];
    actions.forEach((a) => states.push(reduce(states.at(-1)!, a)));

    let current = states.at(-1)!;
    const redo: PlayerAction[] = [];
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const undone = undoLast(current, P1, floor)!;
      redo.push(undone.action);
      current = undone.state;
      expect(comparable(current)).toEqual(comparable(states[i]));
    }
    expect(undoLast(current, P1, floor)).toBeNull();

    while (redo.length > 0) {
      current = redoAction(current, redo.pop()!)!;
    }
    expect(comparable(current)).toEqual(comparable(states.at(-1)!));
  });

  it('never undoes the game setup', () => {
    const { state, floor } = setUp();
    expect(undoLast(state, P1, floor)).toBeNull();
    // Without a floor, only newGame itself is out of reach.
    expect(undoLast(state, P1, 0)?.action.type).toBe('draw');
  });

  it('only takes back the given player’s latest action', () => {
    let state = startGame([player('p1', 5), player('p2', 5)]);
    state = applyAll(state, [
      { type: 'draw', playerId: 'p1', count: 1 },
      { type: 'adjustLife', playerId: 'p2', delta: -1 },
    ]);
    const undone = undoLast(state, 'p1', 1)!;
    expect(undone.action).toEqual({ type: 'draw', playerId: 'p1', count: 1 });
    expect(zone(undone.state, 'p1', 'hand')).toHaveLength(0);
    expect(undone.state.players[1].life).toBe(19);
    expect(undoLast(state, 'nobody', 1)).toBeNull();
  });

  it('redo is refused once it would change nothing', () => {
    const { state, floor } = setUp();
    const after = reduce(state, { type: 'setLife', playerId: P1, life: 3 });
    const undone = undoLast(after, P1, floor)!;
    const moved = reduce(undone.state, {
      type: 'setLife',
      playerId: P1,
      life: 3,
    });
    expect(redoAction(moved, undone.action)).toBeNull();
  });
});
