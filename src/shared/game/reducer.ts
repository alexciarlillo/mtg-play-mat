import {
  markCommanders,
  reduceCommander,
  withCommanderRules,
} from './commander';
import { isControlAction, reduceControl } from './control';
import { emptyGame, getPlayer, reduceCore } from './core';
import { hideReveal, reduceLibrary } from './library';
import { mtgRules, reduceMtg } from './mtg';
import type {
  CommanderAction,
  GameAction,
  GameState,
  LibraryAction,
  MtgAction,
} from './types';
import { actionPlayer } from './validate';

const mtgActionTypes: ReadonlySet<string> = new Set<MtgAction['type']>([
  'tap',
  'untap',
  'toggleTap',
  'untapAll',
  'adjustLife',
  'setLife',
  'mulligan',
  'keepHand',
  'adjustCounter',
  'adjustPlayerCounter',
  'createTokens',
  'copyCard',
  'setFaceDown',
  'transform',
  'attach',
]);

const isMtgAction = (action: GameAction): action is MtgAction =>
  mtgActionTypes.has(action.type);

const commanderActionTypes: ReadonlySet<string> = new Set<
  CommanderAction['type']
>([
  'adjustCommanderCasts',
  'adjustCommanderDamage',
  'addDummy',
  'removeDummy',
  'adjustDummyLife',
]);

const isCommanderAction = (action: GameAction): action is CommanderAction =>
  commanderActionTypes.has(action.type);

const libraryActionTypes: ReadonlySet<string> = new Set<LibraryAction['type']>([
  'mill',
  'arrangeTop',
  'searchLibrary',
  'reveal',
  'hideReveal',
  'nextTurn',
  'setPhase',
]);

const isLibraryAction = (action: GameAction): action is LibraryAction =>
  libraryActionTypes.has(action.type);

const rules = withCommanderRules(mtgRules);

const reduceAny = (state: GameState, action: GameAction): GameState => {
  if (isMtgAction(action)) return reduceMtg(state, action);
  if (isCommanderAction(action)) return reduceCommander(state, action);
  if (isLibraryAction(action)) return reduceLibrary(state, action, rules);
  if (isControlAction(action)) return reduceControl(state, action, rules);
  if (action.type === 'newGame') {
    return markCommanders(reduceCore(state, action, rules));
  }
  return reduceCore(state, action, rules);
};

// A reveal lasts until its player does anything else.
const endReveal = (
  before: GameState,
  after: GameState,
  action: GameAction
): GameState => {
  if (action.type === 'newGame' || action.type === 'reveal') return after;
  const actor = actionPlayer(before, action);
  if (!actor || !getPlayer(after, actor)?.revealed) return after;
  return hideReveal(after, actor);
};

// Applies one action. Actions that change nothing (an unknown card, an
// empty library) return the same state object and are not logged.
export const reduce = (state: GameState, action: GameAction): GameState => {
  const next = reduceAny(state, action);

  if (next === state || action.type === 'newGame') return next;
  const shown = endReveal(state, next, action);
  return { ...shown, seq: state.seq + 1, log: [...state.log, action] };
};

// Rebuilds a game from its log; the seed in log[0] makes it deterministic.
export const replay = (
  log: readonly GameAction[],
  from: GameState = emptyGame()
): GameState => log.reduce(reduce, from);
