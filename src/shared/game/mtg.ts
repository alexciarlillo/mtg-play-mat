import type { Rules } from './core';
import type { CardInstance, GameState, MtgAction } from './types';

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

export const reduceMtg = (state: GameState, action: MtgAction): GameState => {
  const card = state.cards[action.instanceId];
  if (card?.zone !== 'battlefield') return state;

  const tapped =
    action.type === 'toggleTap' ? !card.tapped : action.type === 'tap';
  return tapped === card.tapped ? state : updateCard(state, card, { tapped });
};
