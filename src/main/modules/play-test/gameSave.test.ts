// @vitest-environment node
import {
  type CardRef,
  emptyGame,
  type GameAction,
  type GameState,
  type LentCard,
  type PlayerAction,
  reduce,
  undoLast,
} from '@shared/game';
import { describe, expect, it } from 'vitest';

import {
  buildSave,
  fitsSave,
  type GameSave,
  MAX_LOG_ACTIONS,
  restoreSave,
  SAVE_VERSION,
  SaveError,
} from './gameSave';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ref = (n: number, name = `Card ${n}`): CardRef => ({
  id: uuid(n),
  name,
  typeLine: 'Creature — Test',
  faces: [{ name, typeLine: 'Creature — Test' }],
  power: '1',
  toughness: '1',
});

const who = { playerId: 'p1', playerName: 'Alice' };

const play = (actions: GameAction[]): GameState =>
  actions.reduce(reduce, emptyGame());

const setup: GameAction[] = [
  {
    type: 'newGame',
    seed: 1234,
    players: [
      {
        id: 'p1',
        name: 'Alice',
        deck: Array.from({ length: 20 }, (_, i) => ref(i)),
        sideboard: [ref(99, 'Wish Target')],
        life: 20,
      },
    ],
  },
  { type: 'shuffle', playerId: 'p1' },
  { type: 'draw', playerId: 'p1', count: 7 },
];

const roundTrip = (save: GameSave) =>
  restoreSave(JSON.parse(JSON.stringify(save)) as unknown, who);

const saveOf = (
  state: GameState,
  extra: { undoFloor?: number; redo?: PlayerAction[] } = {}
) =>
  buildSave({
    appVersion: '1.2.3',
    deckName: 'Elves',
    state,
    undoFloor: extra.undoFloor ?? 3,
    redo: extra.redo ?? [],
    lines: [{ text: 'started a new game', at: 5 }],
    now: 1000,
  });

const withoutSeq = ({ seq: _seq, ...rest }: GameState) => rest;

const midGame = () => {
  let state = play(setup);
  const hand = state.players[0].zones.hand;
  const steps: PlayerAction[] = [
    { type: 'moveCard', instanceId: hand[0], to: 'battlefield' },
    {
      type: 'moveCards',
      playerId: 'p1',
      instanceIds: [hand[1], hand[2]],
      to: 'graveyard',
    },
    { type: 'setTapped', playerId: 'p1', instanceIds: [hand[0]], tapped: true },
    { type: 'setTopRevealed', playerId: 'p1', revealed: true },
    {
      type: 'arrangeTop',
      playerId: 'p1',
      top: [],
      bottom: [state.players[0].zones.library[0]],
      graveyard: [],
      exile: [],
      hand: [],
      bottomRandom: true,
    },
    {
      type: 'searchLibrary',
      playerId: 'p1',
      picks: [
        {
          instanceId: state.players[0].zones.library[3],
          to: 'battlefield',
          tapped: true,
        },
      ],
      shuffle: true,
      reveal: true,
    },
    { type: 'adjustLife', playerId: 'p1', delta: -3 },
    { type: 'mill', playerId: 'p1', count: 2, to: 'exile' },
  ];
  steps.forEach((action) => {
    state = reduce(state, action);
  });
  return state;
};

describe('restoreSave', () => {
  it('replays a game into the same board, log and undo history', () => {
    const state = midGame();
    // Every step above changed the game.
    expect(state.log).toHaveLength(11);
    const undone = undoLast(state, 'p1', 3);
    if (!undone) throw new Error('nothing to undo');

    const restored = roundTrip(
      saveOf(undone.state, { undoFloor: 3, redo: [undone.action] })
    );

    expect(withoutSeq(restored.state)).toEqual(withoutSeq(undone.state));
    expect(restored.undoFloor).toBe(3);
    expect(restored.redo).toEqual([undone.action]);
    expect(restored.lines).toEqual([{ text: 'started a new game', at: 5 }]);
    expect(restored.deckName).toBe('Elves');
    expect(restored.savedAt).toBe(1000);
    // Undo after the restore takes back the same action as before it.
    expect(undoLast(restored.state, 'p1', 3)?.action).toEqual(
      undoLast(undone.state, 'p1', 3)?.action
    );
  });

  it('keeps the player’s current name', () => {
    const restored = restoreSave(
      JSON.parse(JSON.stringify(saveOf(midGame()))) as unknown,
      { playerId: 'p1', playerName: 'Alicia' }
    );
    expect(restored.state.players[0].name).toBe('Alicia');
  });

  it('moves only this player’s ids, never another player’s', () => {
    const card: LentCard = {
      instanceId: 'bob:7',
      ref: ref(50, 'Borrowed Bear'),
      isToken: false,
      tapped: false,
      faceDown: false,
      faceIndex: 0,
      counters: {},
    };
    let state = play(setup);
    const own = state.players[0].zones.hand[0];
    state = reduce(state, {
      type: 'moveCard',
      instanceId: own,
      to: 'battlefield',
    });
    state = reduce(state, { type: 'giveControl', instanceId: own, to: 'bob' });
    state = reduce(state, {
      type: 'gainControl',
      playerId: 'p1',
      owner: 'bob',
      card,
    });
    state = reduce(state, { type: 'releaseControl', instanceIds: ['bob:7'] });
    state = reduce(state, {
      type: 'regainControl',
      instanceId: own,
      to: 'battlefield',
      state: { tapped: false, faceDown: false, faceIndex: 0, counters: {} },
    });
    const save = JSON.parse(
      JSON.stringify(saveOf(state, { undoFloor: state.log.length })).replaceAll(
        '"p1',
        '"old'
      )
    ) as GameSave;

    const restored = restoreSave(save, who);
    expect(restored.state.log).toEqual(state.log);
    expect(restored.state.log).toContainEqual(
      expect.objectContaining({ type: 'giveControl', to: 'bob' })
    );
    expect(restored.state.log).toContainEqual(
      expect.objectContaining({
        type: 'releaseControl',
        instanceIds: ['bob:7'],
      })
    );
  });

  it('cuts a very long log line instead of refusing the save', () => {
    const save = JSON.parse(JSON.stringify(saveOf(midGame()))) as GameSave;
    save.lines = [{ text: `milled ${'Forest, '.repeat(500)}`, at: 9 }];
    const [line] = restoreSave(save, who).lines;
    expect(line.text.length).toBeLessThanOrEqual(300);
    expect(line.text).toMatch(/^milled Forest/);
  });

  it('never refuses a game it would let itself save', () => {
    expect(fitsSave(midGame())).toBe(true);
    const long = { ...midGame(), log: new Array(MAX_LOG_ACTIONS + 1) };
    expect(fitsSave(long as GameState)).toBe(false);
  });

  it('moves the game onto this launch’s player id', () => {
    const state = midGame();
    const save = JSON.parse(
      JSON.stringify(saveOf(state)).replaceAll('"p1', '"old')
    ) as GameSave;
    expect(JSON.stringify(save)).not.toContain('p1');
    const restored = restoreSave(save, who);
    expect(withoutSeq(restored.state)).toEqual(withoutSeq(state));
  });

  it('replays control changes, and sends home what never came back', () => {
    const card: LentCard = {
      instanceId: 'bob:7',
      ref: ref(50, 'Borrowed Bear'),
      isToken: false,
      tapped: false,
      faceDown: false,
      faceIndex: 0,
      counters: {},
    };
    let state = play(setup);
    const own = state.players[0].zones.hand[0];
    state = reduce(state, {
      type: 'moveCard',
      instanceId: own,
      to: 'battlefield',
    });
    state = reduce(state, { type: 'giveControl', instanceId: own, to: 'bob' });
    state = reduce(state, {
      type: 'gainControl',
      playerId: 'p1',
      owner: 'bob',
      card,
    });
    expect(state.cards['bob:7']).toBeDefined();

    const restored = roundTrip(saveOf(state, { undoFloor: state.log.length }));
    expect(restored.state.cards['bob:7']).toBeUndefined();
    expect(restored.state.cards[own].controller).toBe('p1');
    expect(restored.state.cards[own].zone).toBe('battlefield');
    // Settling crossed games, so none of it undoes.
    expect(restored.undoFloor).toBe(restored.state.log.length);
    expect(restored.redo).toEqual([]);
  });

  it('refuses a save from another format version', () => {
    const save = { ...saveOf(midGame()), version: SAVE_VERSION + 1 };
    expect(() => roundTrip(save)).toThrow(SaveError);
    try {
      roundTrip(save);
    } catch (err) {
      expect((err as SaveError).version).toBe(true);
      expect((err as SaveError).message).toContain('1.2.3');
    }
  });

  const broken: [string, (save: GameSave) => unknown][] = [
    ['not an object', () => 'nope'],
    ['another kind of file', (save) => ({ ...save, kind: 'other' })],
    ['an empty log', (save) => ({ ...save, log: [] })],
    ['no new game first', (save) => ({ ...save, log: save.log.slice(1) })],
    [
      'an unknown action',
      (save) => ({ ...save, log: [...save.log, { type: 'explode' }] }),
    ],
    [
      'an action that does nothing now',
      (save) => ({
        ...save,
        log: [...save.log, { type: 'moveCard', instanceId: 'x', to: 'hand' }],
      }),
    ],
    [
      'another player’s action',
      (save) => ({
        ...save,
        log: [...save.log, { type: 'adjustLife', playerId: 'p2', delta: 1 }],
      }),
    ],
    ['a floor past the log', (save) => ({ ...save, undoFloor: 999 })],
    ['a bad redo', (save) => ({ ...save, redo: [{ type: 'draw' }] })],
    ['a bad line', (save) => ({ ...save, lines: [{ text: 5, at: 1 }] })],
    [
      'a bad card',
      (save) => {
        const [first, ...rest] = save.log;
        if (first.type !== 'newGame') throw new Error('bad fixture');
        const deck = [{ name: 'no id' }];
        const players = [{ ...first.players[0], deck }];
        return { ...save, log: [{ ...first, players }, ...rest] };
      },
    ],
  ];

  it.each(broken)('refuses %s, whole', (_, breakIt) => {
    const save = JSON.parse(JSON.stringify(saveOf(midGame()))) as GameSave;
    expect(() => restoreSave(breakIt(save), who)).toThrow(SaveError);
  });
});
