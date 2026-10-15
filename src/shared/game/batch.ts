import { currentFace } from './cardRefs';
import { getPlayer, moveCard, type Rules, setPosition } from './core';
import type {
  BatchAction,
  CardInstance,
  CardRef,
  CardTypeFilter,
  GameAction,
  GameState,
  InstanceId,
  PlayerState,
  Position,
  ZoneId,
} from './types';

const batchActionTypes: ReadonlySet<string> = new Set<BatchAction['type']>([
  'moveCards',
  'moveAll',
  'setTapped',
  'setPositions',
]);

export const isBatchAction = (action: GameAction): action is BatchAction =>
  batchActionTypes.has(action.type);

type Typed = Pick<CardInstance, 'faceDown' | 'faceIndex' | 'zone'> & {
  ref: CardRef | null;
};

// A face-down permanent is a 2/2 creature with no other types, so it is
// one to "all creatures"; face down anywhere else it has no types at all.
const cardTypes = (card: Typed): string[] => {
  if (card.faceDown || !card.ref) {
    return card.zone === 'battlefield' ? ['creature'] : [];
  }
  const line =
    currentFace(card.ref, card.faceIndex)?.typeLine ?? card.ref.typeLine;
  // Subtypes follow the dash; only the types before it count.
  return (line.split('—')[0] ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
};

export const matchesTypes = (
  card: Typed,
  filter: CardTypeFilter | undefined
): boolean => {
  if (!filter) return true;
  const types = cardTypes(card);
  const has = (wanted: string) => types.includes(wanted.toLowerCase());
  const { types: anyOf = [], excludeTypes = [] } = filter;
  return (anyOf.length === 0 || anyOf.some(has)) && !excludeTypes.some(has);
};

const distinct = (ids: InstanceId[]) => new Set(ids).size === ids.length;

// Only cards in one of the player's own zone lists: their permanents
// (borrowed ones too), and their other cards, but not a lent permanent.
const holds = (state: GameState, player: PlayerState, id: InstanceId) => {
  const card = state.cards[id] as CardInstance | undefined;
  return card !== undefined && player.zones[card.zone].includes(id);
};

interface Placement {
  index?: number;
  tapped?: boolean;
}

// Each card moves exactly as moveCard moves it, so tokens, attachments,
// commanders and borrowed permanents behave as in a single move. Cards
// already in the zone stay where they are.
const moveCards = (
  state: GameState,
  rules: Rules,
  player: PlayerState,
  ids: InstanceId[],
  to: ZoneId,
  { index, tapped }: Placement = {}
): GameState => {
  if (
    ids.length === 0 ||
    !distinct(ids) ||
    !ids.every((id) => holds(state, player, id))
  ) {
    return state;
  }
  const moving = ids.filter((id) => state.cards[id].zone !== to);
  return moving.reduce(
    (next, id, i) =>
      moveCard(next, rules, id, to, {
        ...(index !== undefined && { index: index + i }),
        tapped,
      }),
    state
  );
};

const setTapped = (
  state: GameState,
  player: PlayerState,
  ids: InstanceId[],
  tapped: boolean
): GameState => {
  const battlefield = new Set(player.zones.battlefield);
  if (
    ids.length === 0 ||
    !distinct(ids) ||
    !ids.every((id) => battlefield.has(id))
  ) {
    return state;
  }
  const changed = ids
    .map((id) => state.cards[id])
    .filter((card) => card.tapped !== tapped);
  if (changed.length === 0) return state;
  const cards = { ...state.cards };
  changed.forEach((card) => {
    cards[card.instanceId] = { ...card, tapped };
  });
  return { ...state, cards };
};

// A card attached, at any depth, to another card in the group moves with
// its host instead of on its own, so it stays attached.
const followsHost = (
  state: GameState,
  id: InstanceId,
  group: ReadonlySet<InstanceId>
): boolean => {
  const seen = new Set<InstanceId>();
  let host = state.cards[id].attachedTo;
  while (host !== null && !seen.has(host)) {
    if (group.has(host)) return true;
    seen.add(host);
    host = state.cards[host]?.attachedTo ?? null;
  }
  return false;
};

const setPositions = (
  state: GameState,
  rules: Rules,
  player: PlayerState,
  positions: { instanceId: InstanceId; position: Position }[]
): GameState => {
  const ids = positions.map(({ instanceId }) => instanceId);
  const battlefield = new Set(player.zones.battlefield);
  if (
    ids.length === 0 ||
    !distinct(ids) ||
    !ids.every((id) => battlefield.has(id))
  ) {
    return state;
  }
  const group = new Set(ids);
  return positions
    .filter(({ instanceId }) => !followsHost(state, instanceId, group))
    .reduce(
      (next, { instanceId, position }) =>
        setPosition(next, rules, next.cards[instanceId], position),
      state
    );
};

export const reduceBatch = (
  state: GameState,
  action: BatchAction,
  rules: Rules
): GameState => {
  const player = getPlayer(state, action.playerId);
  if (!player) return state;

  switch (action.type) {
    case 'moveCards':
      return moveCards(state, rules, player, action.instanceIds, action.to, {
        index: action.index,
        tapped: action.tapped,
      });
    case 'moveAll': {
      if (action.from === action.to) return state;
      const ids = player.zones[action.from].filter((id) =>
        matchesTypes(state.cards[id], action.filter)
      );
      return moveCards(state, rules, player, ids, action.to);
    }
    case 'setTapped':
      return setTapped(state, player, action.instanceIds, action.tapped);
    case 'setPositions':
      return setPositions(state, rules, player, action.positions);
  }
};
