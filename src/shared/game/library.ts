import {
  drawCards,
  getPlayer,
  moveCard,
  type Rules,
  shuffleLibrary,
  updatePlayer,
  updateZone,
} from './core';
import { untapAll } from './mtg';
import { shuffle } from './rng';
import type {
  ArrangeTopAction,
  GameState,
  InstanceId,
  LibraryAction,
  Phase,
  PlayerId,
  PlayerState,
  PutFromHandAction,
  Reveal,
  RevealAction,
  SearchLibraryAction,
} from './types';

const moveAll = (
  state: GameState,
  rules: Rules,
  ids: InstanceId[],
  to: 'graveyard' | 'exile' | 'hand'
) => ids.reduce((next, id) => moveCard(next, rules, id, to), state);

const distinct = (ids: InstanceId[]) => new Set(ids).size === ids.length;

const sameIds = (a: InstanceId[], b: InstanceId[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// Refused unless the lists name each of the top cards exactly once, so a
// stale look (the library changed meanwhile) can't scramble it. Random
// order comes from state.rng, so undo replays it exactly.
const arrangeTop = (
  state: GameState,
  rules: Rules,
  player: PlayerState,
  action: ArrangeTopAction
): GameState => {
  const { top, graveyard, exile, hand } = action;
  const all = [...top, ...action.bottom, ...graveyard, ...exile, ...hand];
  const library = player.zones.library;
  const looked = new Set(library.slice(0, all.length));
  if (
    all.length === 0 ||
    all.length > library.length ||
    !distinct(all) ||
    !all.every((id) => looked.has(id))
  ) {
    return state;
  }

  const [bottom, rng] = action.bottomRandom
    ? shuffle(action.bottom, state.rng)
    : [action.bottom, state.rng];
  const rest = library.slice(all.length);
  const order = [...top, ...graveyard, ...exile, ...hand, ...rest, ...bottom];
  const moves = graveyard.length + exile.length + hand.length;
  // A random order or a shuffle is a change even if nothing moved.
  const randomised =
    action.shuffleAfter || (action.bottomRandom && bottom.length > 1);
  if (moves === 0 && !randomised && sameIds(order, library)) {
    return state;
  }

  const arranged = {
    ...updateZone(state, player.id, 'library', () => order),
    rng,
  };
  const placed = moveAll(
    moveAll(
      moveAll(arranged, rules, graveyard, 'graveyard'),
      rules,
      exile,
      'exile'
    ),
    rules,
    hand,
    'hand'
  );
  return action.shuffleAfter ? shuffleLibrary(placed, player.id) : placed;
};

// Picks leave the library before the shuffle, so top and bottom picks
// land around a shuffled library rather than being shuffled into it.
const searchLibrary = (
  state: GameState,
  rules: Rules,
  player: PlayerState,
  action: SearchLibraryAction
): GameState => {
  const ids = action.picks.map((pick) => pick.instanceId);
  const library = new Set(player.zones.library);
  if (!distinct(ids) || !ids.every((id) => library.has(id))) return state;
  if (ids.length === 0 && !action.shuffle) return state;

  const picked = new Set(ids);
  const removed = updateZone(state, player.id, 'library', (zone) =>
    zone.filter((id) => !picked.has(id))
  );
  const shuffled = action.shuffle
    ? shuffleLibrary(removed, player.id)
    : removed;

  let top = 0;
  return action.picks.reduce((next, { instanceId, to, tapped }) => {
    if (to === 'top') {
      return moveCard(next, rules, instanceId, 'library', { index: top++ });
    }
    if (to === 'bottom') return moveCard(next, rules, instanceId, 'library');
    return moveCard(next, rules, instanceId, to, { tapped });
  }, shuffled);
};

// Refused unless every card is a distinct card in the hand, so a stale
// pick (the hand changed meanwhile) puts nothing back.
const putFromHand = (
  state: GameState,
  rules: Rules,
  player: PlayerState,
  action: PutFromHandAction
): GameState => {
  const ids = [...action.top, ...action.bottom];
  const hand = new Set(player.zones.hand);
  if (ids.length === 0 || !distinct(ids) || !ids.every((id) => hand.has(id))) {
    return state;
  }
  const onTop = action.top.reduce(
    (next, id, i) => moveCard(next, rules, id, 'library', { index: i }),
    state
  );
  return action.bottom.reduce(
    (next, id) => moveCard(next, rules, id, 'library'),
    onTop
  );
};

const revealedIds = (
  state: GameState,
  player: PlayerState,
  action: RevealAction
): InstanceId[] => {
  switch (action.source) {
    case 'hand':
      return player.zones.hand;
    case 'libraryTop':
      return player.zones.library.slice(0, Math.max(0, action.count));
    case 'card':
      return state.cards[action.instanceId]?.zone === 'hand' &&
        player.zones.hand.includes(action.instanceId)
        ? [action.instanceId]
        : [];
  }
};

const reveal = (
  state: GameState,
  player: PlayerState,
  action: RevealAction
): GameState => {
  const instanceIds = revealedIds(state, player, action);
  if (instanceIds.length === 0) return state;
  const current = player.revealed;
  if (
    current?.source === action.source &&
    sameIds(current.instanceIds, instanceIds)
  ) {
    return state;
  }
  const revealed: Reveal = { source: action.source, instanceIds };
  return updatePlayer(state, player.id, { revealed });
};

// Removes a player's reveal, if any.
export const hideReveal = (state: GameState, playerId: PlayerId): GameState => {
  const player = getPlayer(state, playerId);
  if (!player?.revealed) return state;
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      const rest = { ...p };
      delete rest.revealed;
      return rest;
    }),
  };
};

// Where a new turn lands once its automatic steps are done.
const turnPhase = (untap: boolean, draw: boolean): Phase => {
  if (draw) return 'main1';
  return untap ? 'upkeep' : 'untap';
};

export const reduceLibrary = (
  state: GameState,
  action: LibraryAction,
  rules: Rules
): GameState => {
  const player = getPlayer(state, action.playerId);
  if (!player) return state;

  switch (action.type) {
    case 'mill':
      return moveAll(
        state,
        rules,
        player.zones.library.slice(0, Math.max(0, action.count)),
        'graveyard'
      );
    case 'arrangeTop':
      return arrangeTop(state, rules, player, action);
    case 'searchLibrary':
      return searchLibrary(state, rules, player, action);
    case 'putFromHand':
      return putFromHand(state, rules, player, action);
    case 'reveal':
      return reveal(state, player, action);
    case 'hideReveal':
      return hideReveal(state, player.id);
    case 'nextTurn': {
      const untapped = action.untap ? untapAll(state, player) : state;
      const drawn = action.draw
        ? drawCards(untapped, rules, player.id, 1)
        : untapped;
      return updatePlayer(drawn, player.id, {
        turn: player.turn + 1,
        phase: turnPhase(action.untap, action.draw),
      });
    }
    case 'setPhase':
      return action.phase === player.phase
        ? state
        : updatePlayer(state, player.id, { phase: action.phase });
  }
};
