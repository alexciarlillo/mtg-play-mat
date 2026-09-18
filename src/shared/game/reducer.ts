import { emptyGame, reduceCore } from './core';
import { mtgRules, reduceMtg } from './mtg';
import type { GameAction, GameState, MtgAction } from './types';

const isMtgAction = (action: GameAction): action is MtgAction =>
  action.type === 'tap' ||
  action.type === 'untap' ||
  action.type === 'toggleTap';

// Applies one action. Actions that change nothing (an unknown card, an
// empty library) return the same state object and are not logged.
export const reduce = (state: GameState, action: GameAction): GameState => {
  const next = isMtgAction(action)
    ? reduceMtg(state, action)
    : reduceCore(state, action, mtgRules);

  if (next === state || action.type === 'newGame') return next;
  return { ...next, seq: state.seq + 1, log: [...state.log, action] };
};

// Rebuilds a game from its log; the seed in log[0] makes it deterministic.
export const replay = (
  log: readonly GameAction[],
  from: GameState = emptyGame()
): GameState => log.reduce(reduce, from);
