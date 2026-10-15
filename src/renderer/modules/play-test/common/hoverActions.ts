import {
  canTransform,
  type CardView,
  type PlayerAction,
  type ZoneId,
} from '@shared/game';

import type { HoverKey } from '../../../ui/hoverKeys';

const moves: Partial<Record<HoverKey, { to: ZoneId; index?: number }>> = {
  g: { to: 'graveyard' },
  e: { to: 'exile' },
  h: { to: 'hand' },
  b: { to: 'battlefield' },
  l: { to: 'library', index: 0 },
  L: { to: 'library' },
  c: { to: 'command' },
};

// The same moves the card's menu offers: never to its own zone, and only
// a commander goes to the command zone.
const moveFor = (card: CardView, key: HoverKey): PlayerAction | null => {
  const move = moves[key];
  if (!move || move.to === card.zone) return null;
  if (move.to === 'command' && !card.isCommander) return null;
  return {
    type: 'moveCard',
    instanceId: card.instanceId,
    to: move.to,
    ...(move.index !== undefined && { index: move.index }),
  };
};

// F flips: a face-up card with another face transforms; anything else
// turns face down, or back up. The public ref of a face-down card has no
// faces to transform to.
const flipFor = (card: CardView): PlayerAction => {
  const { instanceId } = card;
  if (card.ref && !card.faceDown && canTransform(card.ref)) {
    return { type: 'transform', instanceId };
  }
  return { type: 'setFaceDown', instanceId, faceDown: !card.faceDown };
};

export const battlefieldHoverAction = (
  card: CardView,
  key: HoverKey
): PlayerAction | null => {
  const { instanceId } = card;
  switch (key) {
    case 't':
      return { type: 'toggleTap', instanceId };
    case 'f':
      return flipFor(card);
    case 'x':
      return { type: 'copyCard', instanceId };
    default:
      return moveFor(card, key);
  }
};

// Keys over a card in a selection of several act on all of them, each as
// one action. Flipping and copying stay with the card under the pointer.
export const selectionHoverAction = (
  cards: CardView[],
  hovered: CardView,
  key: HoverKey
): PlayerAction | null => {
  const playerId = hovered.controller;
  const instanceIds = cards.map((card) => card.instanceId);
  if (key === 't') {
    return {
      type: 'setTapped',
      playerId,
      instanceIds,
      tapped: !hovered.tapped,
    };
  }
  if (key === 'f' || key === 'x') return battlefieldHoverAction(hovered, key);
  const move = moves[key];
  if (!move || move.to === 'battlefield') return null;
  if (move.to === 'command' && !cards.every((card) => card.isCommander)) {
    return null;
  }
  return {
    type: 'moveCards',
    playerId,
    instanceIds,
    to: move.to,
    ...(move.index !== undefined && { index: move.index }),
  };
};

// Tapping, flipping and copying only mean something on the battlefield.
export const handHoverAction = (
  card: CardView,
  key: HoverKey
): PlayerAction | null =>
  ['t', 'f', 'x'].includes(key) ? null : moveFor(card, key);
