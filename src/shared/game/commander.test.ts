import { describe, expect, it } from 'vitest';

import { commanderMoves, commanderTax, startingLife } from './commander';
import { reduce, replay } from './reducer';
import {
  applyAll,
  cardRef,
  deepFreeze,
  player,
  startGame,
  zone,
} from './testFixtures';
import type { GameAction, GameState, ZoneId } from './types';
import { parsePlayerAction } from './validate';
import { publicView } from './views';

const P1 = 'p1';

const commanderGame = (partners = 1): GameState =>
  startGame([
    player(P1, 10, {
      life: startingLife('commander'),
      command: Array.from({ length: partners }, (_, i) =>
        cardRef(`Commander ${i}`, `cmdr-${i}`)
      ),
    }),
  ]);

const commanderId = (state: GameState, index = 0) =>
  Object.values(state.cards).filter((card) => card.isCommander)[index]
    .instanceId;

const move = (instanceId: string, to: ZoneId): GameAction => ({
  type: 'moveCard',
  instanceId,
  to,
});

describe('commander setup', () => {
  it('starts at 40 life in commander and 20 otherwise', () => {
    expect(startingLife('commander')).toBe(40);
    expect(startingLife('constructed')).toBe(20);
    expect(startingLife('other')).toBe(20);
    expect(commanderGame().players[0].life).toBe(40);
  });

  it('marks command-zone cards (up to partners) as commanders', () => {
    const state = commanderGame(2);
    const command = zone(state, P1, 'command').map((id) => state.cards[id]);
    expect(command).toHaveLength(2);
    command.forEach((card) =>
      expect(card).toMatchObject({ isCommander: true, commanderCasts: 0 })
    );
    const library = zone(state, P1, 'library').map((id) => state.cards[id]);
    expect(library.some((card) => card.isCommander)).toBe(false);
  });

  it('marks nothing without a command zone', () => {
    const state = startGame();
    expect(Object.values(state.cards).some((c) => c.isCommander)).toBe(false);
  });
});

describe('commander tax', () => {
  it('does not move when a commander is cast', () => {
    let state = commanderGame();
    const id = commanderId(state);
    expect(commanderTax(state.cards[id])).toBe(0);

    state = reduce(state, move(id, 'battlefield'));
    expect(state.cards[id]).toMatchObject({
      zone: 'battlefield',
      commanderCasts: 0,
    });
    expect(commanderTax(state.cards[id])).toBe(0);

    state = applyAll(state, [
      move(id, 'command'),
      move(id, 'battlefield'),
      move(id, 'command'),
    ]);
    expect(commanderTax(state.cards[id])).toBe(0);
  });

  it('does not move for a trip through any other zone either', () => {
    let state = commanderGame();
    const id = commanderId(state);
    state = applyAll(state, [
      move(id, 'hand'),
      move(id, 'battlefield'),
      move(id, 'graveyard'),
      move(id, 'command'),
      move(id, 'exile'),
    ]);
    expect(state.cards[id].commanderCasts).toBe(0);
  });

  it('keeps the flag and count through every zone change', () => {
    let state = commanderGame();
    const id = commanderId(state);
    state = reduce(state, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: 1,
    });
    state = reduce(state, move(id, 'battlefield'));
    state = reduce(state, { type: 'toggleTap', instanceId: id });
    for (const to of [
      'graveyard',
      'exile',
      'hand',
      'library',
      'battlefield',
      'command',
    ] as ZoneId[]) {
      state = reduce(state, move(id, to));
      expect(state.cards[id]).toMatchObject({
        zone: to,
        isCommander: true,
        commanderCasts: 1,
      });
    }
    state = reduce(state, { type: 'shuffleIntoLibrary', instanceId: id });
    expect(state.cards[id]).toMatchObject({
      zone: 'library',
      isCommander: true,
      tapped: false,
    });
  });

  it('adjusts manually, never below zero', () => {
    let state = commanderGame();
    const id = commanderId(state);
    state = reduce(state, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: 2,
    });
    expect(commanderTax(state.cards[id])).toBe(4);
    state = reduce(state, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: -1,
    });
    expect(state.cards[id].commanderCasts).toBe(1);

    const floored = reduce(state, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: -5,
    });
    expect(floored.cards[id].commanderCasts).toBe(0);
    const unchanged = reduce(floored, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: -1,
    });
    expect(unchanged).toBe(floored);
  });

  it('ignores tax changes on non-commanders', () => {
    const state = commanderGame();
    const [card] = zone(state, P1, 'library');
    expect(
      reduce(state, {
        type: 'adjustCommanderCasts',
        instanceId: card,
        delta: 1,
      })
    ).toBe(state);
  });

  it('tracks partners separately', () => {
    let state = commanderGame(2);
    const [a, b] = [commanderId(state, 0), commanderId(state, 1)];
    state = applyAll(state, [
      { type: 'adjustCommanderCasts', instanceId: a, delta: 2 },
      { type: 'adjustCommanderCasts', instanceId: b, delta: 1 },
      move(a, 'battlefield'),
      move(b, 'battlefield'),
    ]);
    expect(state.cards[a].commanderCasts).toBe(2);
    expect(state.cards[b].commanderCasts).toBe(1);
  });
});

describe('commanderMoves', () => {
  it('reports a commander entering a zone it may return from', () => {
    const start = reduce(
      commanderGame(),
      move(commanderId(commanderGame()), 'battlefield')
    );
    const id = commanderId(start);
    for (const to of ['graveyard', 'exile', 'hand', 'library'] as ZoneId[]) {
      const next = reduce(start, move(id, to));
      expect(commanderMoves(start, next, P1)).toEqual([
        { instanceId: id, name: 'Commander 0', zone: to },
      ]);
    }
    const back = reduce(start, move(id, 'command'));
    expect(commanderMoves(start, back, P1)).toEqual([]);
    expect(commanderMoves(start, start, P1)).toEqual([]);
  });

  it('ignores other cards and other owners', () => {
    let state = commanderGame();
    const [card] = zone(state, P1, 'library');
    state = reduce(state, move(card, 'battlefield'));
    const next = reduce(state, move(card, 'graveyard'));
    expect(commanderMoves(state, next, P1)).toEqual([]);

    const id = commanderId(state);
    const died = reduce(state, move(id, 'graveyard'));
    expect(commanderMoves(state, died, 'p2')).toEqual([]);
  });
});

describe('commander damage', () => {
  it('records damage per source and takes it from life', () => {
    let state = commanderGame();
    state = applyAll(state, [
      {
        type: 'adjustCommanderDamage',
        playerId: P1,
        source: 'peer/p:1',
        sourceName: 'Atraxa',
        delta: 5,
      },
      {
        type: 'adjustCommanderDamage',
        playerId: P1,
        source: 'peer/p:2',
        sourceName: 'Tymna',
        delta: 3,
      },
      {
        type: 'adjustCommanderDamage',
        playerId: P1,
        source: 'peer/p:1',
        sourceName: 'Atraxa',
        delta: 2,
      },
    ]);
    const me = state.players[0];
    expect(me.commanderDamage).toEqual([
      { source: 'peer/p:1', name: 'Atraxa', damage: 7 },
      { source: 'peer/p:2', name: 'Tymna', damage: 3 },
    ]);
    expect(me.life).toBe(30);
    expect(publicView(state, P1)?.commanderDamage).toEqual(me.commanderDamage);
  });

  it('never goes below zero and drops empty entries', () => {
    let state = reduce(commanderGame(), {
      type: 'adjustCommanderDamage',
      playerId: P1,
      source: 's',
      sourceName: 'S',
      delta: 2,
    });
    state = reduce(state, {
      type: 'adjustCommanderDamage',
      playerId: P1,
      source: 's',
      sourceName: 'S',
      delta: -5,
    });
    expect(state.players[0].commanderDamage).toEqual([]);
    expect(state.players[0].life).toBe(40);
    const same = reduce(state, {
      type: 'adjustCommanderDamage',
      playerId: P1,
      source: 's',
      sourceName: 'S',
      delta: -1,
    });
    expect(same).toBe(state);
  });
});

describe('dummy opponents', () => {
  const addTwo: GameAction[] = [
    { type: 'addDummy', playerId: P1, name: 'Opponent 1' },
    { type: 'addDummy', playerId: P1, name: 'Opponent 2' },
  ];

  it('adds up to three, starting at the game life', () => {
    let state = applyAll(commanderGame(), addTwo);
    expect(state.players[0].dummies).toEqual([
      { id: 'dummy-1', name: 'Opponent 1', life: 40, commanderDamage: [] },
      { id: 'dummy-2', name: 'Opponent 2', life: 40, commanderDamage: [] },
    ]);
    state = applyAll(state, [
      { type: 'addDummy', playerId: P1, name: 'Three' },
      { type: 'addDummy', playerId: P1, name: 'Four' },
    ]);
    expect(state.players[0].dummies?.map((d) => d.name)).toEqual([
      'Opponent 1',
      'Opponent 2',
      'Three',
    ]);

    const sixty = reduce(startGame(), {
      type: 'addDummy',
      playerId: P1,
      name: 'Goldfish',
    });
    expect(sixty.players[0].dummies?.[0].life).toBe(20);
  });

  it('tracks life and commander damage per dummy', () => {
    let state = applyAll(commanderGame(), addTwo);
    const id = commanderId(state);
    state = applyAll(state, [
      { type: 'adjustDummyLife', playerId: P1, dummyId: 'dummy-1', delta: -3 },
      {
        type: 'adjustCommanderDamage',
        playerId: P1,
        dummyId: 'dummy-2',
        source: id,
        sourceName: 'Commander 0',
        delta: 5,
      },
    ]);
    const [one, two] = state.players[0].dummies ?? [];
    expect(one).toMatchObject({ life: 37, commanderDamage: [] });
    expect(two).toMatchObject({
      life: 35,
      commanderDamage: [{ source: id, name: 'Commander 0', damage: 5 }],
    });
    // The player's own life and damage are untouched.
    expect(state.players[0].life).toBe(40);
    expect(state.players[0].commanderDamage).toBeUndefined();
    expect(publicView(state, P1)?.dummies).toEqual(state.players[0].dummies);
  });

  it('removes a dummy and reuses its id', () => {
    let state = applyAll(commanderGame(), [
      ...addTwo,
      { type: 'removeDummy', playerId: P1, dummyId: 'dummy-1' },
    ]);
    expect(state.players[0].dummies?.map((d) => d.id)).toEqual(['dummy-2']);
    state = reduce(state, { type: 'addDummy', playerId: P1, name: 'Again' });
    expect(state.players[0].dummies?.map((d) => d.id)).toEqual([
      'dummy-2',
      'dummy-1',
    ]);
    const unknown = reduce(state, {
      type: 'adjustDummyLife',
      playerId: P1,
      dummyId: 'nope',
      delta: 1,
    });
    expect(unknown).toBe(state);
  });
});

describe('commander actions', () => {
  it('are pure, logged, and replay deterministically', () => {
    const start = commanderGame();
    const id = commanderId(start);
    const actions: GameAction[] = [
      move(id, 'battlefield'),
      { type: 'adjustCommanderCasts', instanceId: id, delta: 1 },
      { type: 'addDummy', playerId: P1, name: 'D' },
      {
        type: 'adjustCommanderDamage',
        playerId: P1,
        dummyId: 'dummy-1',
        source: id,
        sourceName: 'Commander 0',
        delta: 21,
      },
    ];
    const end = actions.reduce(
      (state, action) => reduce(deepFreeze(state), action),
      start
    );
    expect(end.log.map((a) => a.type)).toEqual([
      'newGame',
      'moveCard',
      'adjustCommanderCasts',
      'addDummy',
      'adjustCommanderDamage',
    ]);
    const replayed = replay(end.log);
    expect(replayed.cards).toEqual(end.cards);
    expect(replayed.players).toEqual(end.players);
  });

  it('are validated from untrusted input', () => {
    expect(
      parsePlayerAction({
        type: 'adjustCommanderDamage',
        playerId: P1,
        source: 's',
        sourceName: 'S',
        delta: 3,
        extra: 'dropped',
      })
    ).toEqual({
      type: 'adjustCommanderDamage',
      playerId: P1,
      source: 's',
      sourceName: 'S',
      delta: 3,
    });
    expect(
      parsePlayerAction({
        type: 'adjustCommanderCasts',
        instanceId: 'p1:0',
        delta: -1,
      })
    ).toEqual({ type: 'adjustCommanderCasts', instanceId: 'p1:0', delta: -1 });
    expect(
      parsePlayerAction({
        type: 'addDummy',
        playerId: P1,
        name: 'x'.repeat(50),
      })
    ).toMatchObject({ name: 'x'.repeat(32) });
    expect(() =>
      parsePlayerAction({ type: 'adjustDummyLife', playerId: P1, delta: 1 })
    ).toThrow(/dummyId/);
    expect(() =>
      parsePlayerAction({
        type: 'adjustCommanderDamage',
        playerId: P1,
        source: '',
        sourceName: 'S',
        delta: 1,
      })
    ).toThrow(/source/);
    expect(() =>
      parsePlayerAction({
        type: 'adjustCommanderCasts',
        instanceId: 'a',
        delta: 1.5,
      })
    ).toThrow(/delta/);
  });
});

describe('commander views', () => {
  it('show the flag and tax wherever the commander is public', () => {
    let state = commanderGame();
    const id = commanderId(state);
    expect(publicView(state, P1)?.zones.command[0]).toMatchObject({
      isCommander: true,
      commanderCasts: 0,
    });
    state = applyAll(state, [
      { type: 'adjustCommanderCasts', instanceId: id, delta: 1 },
      move(id, 'battlefield'),
    ]);
    expect(publicView(state, P1)?.zones.battlefield[0]).toMatchObject({
      isCommander: true,
      commanderCasts: 1,
    });
    const [other] = zone(state, P1, 'library');
    state = reduce(state, move(other, 'battlefield'));
    const plain = publicView(state, P1)?.zones.battlefield[1];
    expect(plain && 'isCommander' in plain).toBe(false);
  });

  it('never leak a commander in hand or library', () => {
    const start = commanderGame();
    const id = commanderId(start);
    for (const to of ['hand', 'library'] as ZoneId[]) {
      const state = reduce(start, move(id, to));
      const json = JSON.stringify(publicView(state, P1));
      expect(json).not.toContain(`"${id}"`);
      expect(json).not.toContain('Commander 0');
      expect(json).not.toContain('cmdr-0');
      expect(json).not.toContain('isCommander');
    }
  });
});
