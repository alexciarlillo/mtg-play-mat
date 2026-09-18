import { emptyGame } from './core';
import { reduce } from './reducer';
import type {
  CardRef,
  GameAction,
  GameState,
  PlayerSetup,
  ZoneId,
} from './types';

export const cardRef = (name: string, id = `id-${name}`): CardRef => ({
  id,
  name,
  typeLine: 'Creature — Test',
  faces: [{ name, typeLine: 'Creature — Test', power: '1', toughness: '1' }],
  power: '1',
  toughness: '1',
});

export const deckOf = (prefix: string, size: number): CardRef[] =>
  Array.from({ length: size }, (_, i) => cardRef(`${prefix} ${i}`));

export const player = (
  id: string,
  size = 10,
  extra: Partial<PlayerSetup> = {}
): PlayerSetup => ({ id, name: id, deck: deckOf(id, size), ...extra });

export const startGame = (
  players: PlayerSetup[] = [player('p1')],
  seed = 42
): GameState => reduce(emptyGame(), { type: 'newGame', seed, players });

export const applyAll = (state: GameState, actions: GameAction[]) =>
  actions.reduce(reduce, state);

// Freezing the input makes any in-place mutation by the reducer throw.
export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export const zone = (state: GameState, playerId: string, name: ZoneId) =>
  state.players.find((p) => p.id === playerId)?.zones[name] ?? [];
