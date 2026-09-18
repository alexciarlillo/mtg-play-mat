import { emptyGame } from './core';
import { reduce, replay } from './reducer';
import type { GameAction, GameState, PlayerAction, PlayerId } from './types';
import { actionPlayer } from './validate';

// Whether the local player has anything to undo or redo.
export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface Undone {
  state: GameState;
  // What was taken back, so a redo can apply it again.
  action: PlayerAction;
}

// Index of the latest logged action by this player at or after floor.
const lastActionBy = (
  log: readonly GameAction[],
  playerId: PlayerId,
  floor: number
): number => {
  let found = -1;
  log.reduce((before, action, i) => {
    if (
      i >= floor &&
      action.type !== 'newGame' &&
      actionPlayer(before, action) === playerId
    ) {
      found = i;
    }
    return reduce(before, action);
  }, emptyGame());
  return found;
};

// Takes back the player's latest action by replaying the log without it.
// Nothing before floor (the game's setup) can be undone. The seed makes
// shuffles replay the same, and seq keeps rising so views stay ordered.
export const undoLast = (
  state: GameState,
  playerId: PlayerId,
  floor: number
): Undone | null => {
  const { log } = state;
  const at = lastActionBy(log, playerId, Math.max(1, floor));
  const action = log[at];
  if (at < 0 || !action || action.type === 'newGame') return null;

  const rebuilt = replay([...log.slice(0, at), ...log.slice(at + 1)]);
  return { state: { ...rebuilt, seq: state.seq + 1 }, action };
};

// Applies an undone action again; null when it no longer does anything.
export const redoAction = (
  state: GameState,
  action: PlayerAction
): GameState | null => {
  const next = reduce(state, action);
  return next === state ? null : next;
};
