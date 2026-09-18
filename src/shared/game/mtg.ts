import {
  drawCards,
  getPlayer,
  moveCard,
  type Rules,
  shuffleLibrary,
  updatePlayer,
} from './core';
import type {
  CardInstance,
  GameState,
  KeepHandAction,
  MtgAction,
  PlayerState,
  TapAction,
} from './types';

export const OPENING_HAND_SIZE = 7;

export const mtgRules: Rules = {
  onZoneChange: (card, from) => {
    if (from !== 'battlefield') return card;
    // Tokens cease to exist anywhere but the battlefield.
    if (card.isToken) return null;
    // A card that leaves the battlefield becomes a new object: it returns
    // to its owner, untapped, face up, and without counters.
    return {
      ...card,
      controller: card.owner,
      tapped: false,
      faceDown: false,
      faceIndex: 0,
      counters: {},
    };
  },
};

const updateCard = (
  state: GameState,
  card: CardInstance,
  patch: Partial<CardInstance>
): GameState => ({
  ...state,
  cards: { ...state.cards, [card.instanceId]: { ...card, ...patch } },
});

const reduceTap = (state: GameState, action: TapAction): GameState => {
  const card = state.cards[action.instanceId];
  if (card?.zone !== 'battlefield') return state;

  const tapped =
    action.type === 'toggleTap' ? !card.tapped : action.type === 'tap';
  return tapped === card.tapped ? state : updateCard(state, card, { tapped });
};

const untapAll = (state: GameState, player: PlayerState): GameState => {
  const tapped = player.zones.battlefield
    .map((id) => state.cards[id])
    .filter((card) => card?.tapped);
  if (tapped.length === 0) return state;

  const cards = { ...state.cards };
  tapped.forEach((card) => {
    cards[card.instanceId] = { ...card, tapped: false };
  });
  return { ...state, cards };
};

const setLife = (
  state: GameState,
  player: PlayerState,
  life: number
): GameState =>
  life === player.life ? state : updatePlayer(state, player.id, { life });

// London mulligan: the whole hand goes back, the library is shuffled, and
// a fresh seven is drawn. The cost is paid on keep (see keepHand).
const mulligan = (state: GameState, player: PlayerState): GameState => {
  if (player.keptHand) return state;

  const returned = player.zones.hand.reduce(
    (next, id) => moveCard(next, mtgRules, id, 'library'),
    state
  );
  const drawn = drawCards(
    shuffleLibrary(returned, player.id),
    mtgRules,
    player.id,
    OPENING_HAND_SIZE
  );
  return updatePlayer(drawn, player.id, { mulligans: player.mulligans + 1 });
};

// The bottom choice must be exactly one distinct hand card per mulligan
// (or the whole hand, if it is smaller); anything else is refused.
const keepHand = (
  state: GameState,
  player: PlayerState,
  action: KeepHandAction
): GameState => {
  if (player.keptHand) return state;

  const hand = player.zones.hand;
  const owed = Math.min(player.mulligans, hand.length);
  const bottom = action.bottom;
  if (
    bottom.length !== owed ||
    new Set(bottom).size !== bottom.length ||
    !bottom.every((id) => hand.includes(id))
  ) {
    return state;
  }

  const bottomed = bottom.reduce(
    (next, id) => moveCard(next, mtgRules, id, 'library'),
    state
  );
  return updatePlayer(bottomed, player.id, { keptHand: true });
};

export const reduceMtg = (state: GameState, action: MtgAction): GameState => {
  if (!('playerId' in action)) return reduceTap(state, action);

  const player = getPlayer(state, action.playerId);
  if (!player) return state;

  switch (action.type) {
    case 'untapAll':
      return untapAll(state, player);
    case 'adjustLife':
      return setLife(state, player, player.life + action.delta);
    case 'setLife':
      return setLife(state, player, action.life);
    case 'mulligan':
      return mulligan(state, player);
    case 'keepHand':
      return keepHand(state, player, action);
  }
};
