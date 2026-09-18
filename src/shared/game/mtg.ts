import { canTransform, currentFace } from './cardRefs';
import {
  attachmentsOf,
  createOnBattlefield,
  drawCards,
  getPlayer,
  moveCard,
  type Rules,
  shuffleLibrary,
  updatePlayer,
} from './core';
import type {
  AttachAction,
  CardInstance,
  GameState,
  InstanceId,
  KeepHandAction,
  MtgAction,
  MtgCardAction,
  PlayerState,
  Position,
} from './types';

export const OPENING_HAND_SIZE = 7;

export const counterNames = {
  plusOne: '+1/+1',
  minusOne: '-1/-1',
  loyalty: 'loyalty',
} as const;

export const playerCounterNames = ['poison', 'energy', 'experience'] as const;

// How far each attachment peeks out from behind its host.
export const ATTACH_OFFSET: Position = { x: 0, y: -28 };

export const MAX_TOKENS = 100;

// A planeswalker enters with its printed loyalty in loyalty counters.
const entryCounters = (
  card: Pick<CardInstance, 'ref' | 'faceIndex' | 'faceDown'>
): Record<string, number> => {
  if (card.faceDown) return {};
  const face = currentFace(card.ref, card.faceIndex);
  const typeLine = face?.typeLine ?? card.ref.typeLine;
  const loyalty = Number.parseInt(face?.loyalty ?? card.ref.loyalty ?? '', 10);
  return /Planeswalker/.test(typeLine) && loyalty > 0
    ? { [counterNames.loyalty]: loyalty }
    : {};
};

export const mtgRules: Rules = {
  onZoneChange: (card, from, to) => {
    // Counters don't follow a card to a new zone (suspend's time counters
    // in exile are gone once it is cast).
    if (from !== 'battlefield') {
      return {
        ...card,
        counters: to === 'battlefield' ? entryCounters(card) : {},
      };
    }
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

// +1/+1 and -1/-1 counters on the same permanent cancel out in pairs.
const annihilate = (counters: Record<string, number>) => {
  const plus = counters[counterNames.plusOne] ?? 0;
  const minus = counters[counterNames.minusOne] ?? 0;
  const pairs = Math.min(plus, minus);
  if (pairs === 0) return counters;
  return {
    ...counters,
    [counterNames.plusOne]: plus - pairs,
    [counterNames.minusOne]: minus - pairs,
  };
};

// Applies a delta, never going below zero, and drops empty counters.
export const adjustCounters = (
  counters: Record<string, number>,
  name: string,
  delta: number
): Record<string, number> => {
  const next = annihilate({
    ...counters,
    [name]: Math.max(0, (counters[name] ?? 0) + delta),
  });
  return Object.fromEntries(
    Object.entries(next).filter(([, count]) => count > 0)
  );
};

const sameCounters = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([name, count]) => b[name] === count);

// Would attaching card to host make a loop (a host attached to its own
// attachment)?
const attachLoops = (state: GameState, card: InstanceId, host: InstanceId) =>
  host === card ||
  attachmentsOf(state, card).some((follower) => follower.instanceId === host);

const attach = (
  state: GameState,
  card: CardInstance,
  action: AttachAction
): GameState => {
  if (action.to === null) {
    if (card.attachedTo === null) return state;
    // Re-appending brings the freed card out from behind its old host.
    const moved = moveCard(state, mtgRules, card.instanceId, 'battlefield');
    return updateCard(moved, moved.cards[card.instanceId], {
      attachedTo: null,
    });
  }

  const host = state.cards[action.to];
  if (
    host?.zone !== 'battlefield' ||
    card.attachedTo === host.instanceId ||
    attachLoops(state, card.instanceId, host.instanceId)
  ) {
    return state;
  }

  const stacked = Object.values(state.cards).filter(
    (other) => other.attachedTo === host.instanceId
  ).length;
  const base = host.position ?? { x: 0, y: 0 };
  const position = {
    x: base.x + ATTACH_OFFSET.x * (stacked + 1),
    y: base.y + ATTACH_OFFSET.y * (stacked + 1),
  };
  const dx = position.x - (card.position?.x ?? 0);
  const dy = position.y - (card.position?.y ?? 0);

  // The card's own attachments come along, keeping their offsets.
  const cards = { ...state.cards };
  attachmentsOf(state, card.instanceId).forEach((follower) => {
    const at = follower.position ?? { x: 0, y: 0 };
    cards[follower.instanceId] = {
      ...follower,
      position: { x: at.x + dx, y: at.y + dy },
    };
  });
  cards[card.instanceId] = { ...card, attachedTo: host.instanceId, position };
  return { ...state, cards };
};

const reduceCard = (state: GameState, action: MtgCardAction): GameState => {
  const card = state.cards[action.instanceId];
  if (!card) return state;

  // Counters also sit on exiled cards (suspend, foretell); everything
  // else here is about permanents.
  if (action.type === 'adjustCounter') {
    if (card.zone !== 'battlefield' && card.zone !== 'exile') return state;
    const counters = adjustCounters(
      card.counters,
      action.counter,
      action.delta
    );
    return sameCounters(counters, card.counters)
      ? state
      : updateCard(state, card, { counters });
  }

  if (card.zone !== 'battlefield') return state;

  switch (action.type) {
    case 'tap':
    case 'untap':
    case 'toggleTap': {
      const tapped =
        action.type === 'toggleTap' ? !card.tapped : action.type === 'tap';
      return tapped === card.tapped
        ? state
        : updateCard(state, card, { tapped });
    }
    case 'copyCard':
      return createOnBattlefield(state, card.controller, [
        {
          ref: card.ref,
          faceDown: card.faceDown,
          faceIndex: card.faceIndex,
          isToken: true,
          counters: entryCounters(card),
        },
      ]);
    case 'setFaceDown':
      if (action.faceDown === card.faceDown) return state;
      // A face-down permanent turned up shows its front face.
      return updateCard(state, card, {
        faceDown: action.faceDown,
        faceIndex: 0,
      });
    case 'transform':
      if (card.faceDown || !canTransform(card.ref)) return state;
      return updateCard(state, card, {
        faceIndex: (card.faceIndex + 1) % card.ref.faces.length,
      });
    case 'attach':
      return attach(state, card, action);
  }
};

export const untapAll = (state: GameState, player: PlayerState): GameState => {
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
  if (!('playerId' in action)) return reduceCard(state, action);

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
    case 'adjustPlayerCounter': {
      const counters = adjustCounters(
        player.counters,
        action.counter,
        action.delta
      );
      return sameCounters(counters, player.counters)
        ? state
        : updatePlayer(state, player.id, { counters });
    }
    case 'createTokens':
      return createOnBattlefield(
        state,
        player.id,
        Array.from({ length: Math.min(action.count, MAX_TOKENS) }, () => ({
          ref: action.ref,
          faceDown: false,
          faceIndex: 0,
          isToken: true,
          counters: entryCounters({
            ref: action.ref,
            faceIndex: 0,
            faceDown: false,
          }),
        }))
      );
  }
};
