import { currentFace } from './cardRefs';
import { getPlayer, updatePlayer } from './core';
import type {
  CardInstance,
  CardStateAction,
  GameAction,
  GameState,
  PlayerState,
  PtOverride,
  SetCardStateAction,
} from './types';
import type { CardView } from './views';

// Keywords offered as one-click badges; anything else is free text.
export const keywordAbilities = [
  'flying',
  'first strike',
  'double strike',
  'deathtouch',
  'haste',
  'hexproof',
  'indestructible',
  'lifelink',
  'menace',
  'reach',
  'trample',
  'vigilance',
  'defender',
  'ward',
  'goaded',
] as const;

export const MAX_ABILITIES = 12;
// Removals cover a whole selection, whose abilities add up across cards.
export const MAX_ABILITY_REMOVALS = 200;
export const MAX_ABILITY_LENGTH = 30;
export const MAX_PT = 999;

// The mana pool rides on player counters, under names no counter dialog
// suggests. Older builds show them as plain counters.
export const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export type ManaColor = (typeof manaColors)[number];
export const manaCounter = (color: ManaColor) => `mana:${color}`;
export const isManaCounter = (name: string) =>
  manaColors.some((color) => name === manaCounter(color));

// A face-down permanent is a creature, whatever it really is.
export const isCreatureView = (
  card: Pick<CardView, 'faceDown' | 'faceIndex' | 'ref'>
): boolean =>
  card.faceDown ||
  /Creature/.test(
    (card.ref && currentFace(card.ref, card.faceIndex)?.typeLine) ??
      card.ref?.typeLine ??
      ''
  );

// Setting a base P/T on these makes them creatures, rather than changing
// a creature's: none is one yet, and none already has a set base.
export const becomesCreature = (
  cards: Pick<CardView, 'faceDown' | 'faceIndex' | 'ref' | 'ptOverride'>[]
): boolean =>
  cards.length > 0 &&
  !cards.some((card) => isCreatureView(card) || card.ptOverride);

const cardStateActionTypes: ReadonlySet<string> = new Set<
  CardStateAction['type']
>(['setCardState', 'emptyManaPool']);

export const isCardStateAction = (
  action: GameAction
): action is CardStateAction => cardStateActionTypes.has(action.type);

// Hand-set state never follows a card off the battlefield.
export const withoutCardState = (card: CardInstance): CardInstance => {
  if (!card.doesntUntap && !card.ptOverride && !card.abilities) return card;
  const rest = { ...card };
  delete rest.doesntUntap;
  delete rest.ptOverride;
  delete rest.abilities;
  return rest;
};

const sameAbility = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

const nextAbilities = (
  current: string[],
  add: string[],
  remove: string[]
): string[] => {
  const kept = current.filter(
    (ability) => !remove.some((gone) => sameAbility(gone, ability))
  );
  const added = add.filter(
    (ability, i) =>
      !kept.some((has) => sameAbility(has, ability)) &&
      add.findIndex((other) => sameAbility(other, ability)) === i
  );
  return [...kept, ...added].slice(0, MAX_ABILITIES);
};

const samePt = (a?: PtOverride, b?: PtOverride) =>
  a?.power === b?.power && a?.toughness === b?.toughness;

const sameList = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const applyState = (
  card: CardInstance,
  action: SetCardStateAction
): CardInstance => {
  const next = { ...card };
  if (action.doesntUntap !== undefined) {
    if (action.doesntUntap) next.doesntUntap = true;
    else delete next.doesntUntap;
  }
  if (action.ptOverride !== undefined) {
    if (action.ptOverride) next.ptOverride = { ...action.ptOverride };
    else delete next.ptOverride;
  }
  if (action.addAbilities || action.removeAbilities) {
    const abilities = nextAbilities(
      card.abilities ?? [],
      action.addAbilities ?? [],
      action.removeAbilities ?? []
    );
    if (abilities.length > 0) next.abilities = abilities;
    else delete next.abilities;
  }
  return next;
};

const changed = (a: CardInstance, b: CardInstance) =>
  a.doesntUntap !== b.doesntUntap ||
  !samePt(a.ptOverride, b.ptOverride) ||
  !sameList(a.abilities, b.abilities);

const setCardState = (
  state: GameState,
  player: PlayerState,
  action: SetCardStateAction
): GameState => {
  const ids = action.instanceIds;
  const battlefield = new Set(player.zones.battlefield);
  if (
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => battlefield.has(id))
  ) {
    return state;
  }
  const updated = ids
    .map((id) => [state.cards[id], applyState(state.cards[id], action)])
    .filter(([was, now]) => changed(was, now))
    .map(([, now]) => now);
  if (updated.length === 0) return state;
  return {
    ...state,
    cards: {
      ...state.cards,
      ...Object.fromEntries(updated.map((card) => [card.instanceId, card])),
    },
  };
};

// The player's counters without any mana; the same object when the pool
// is already empty.
export const emptyPool = (state: GameState, player: PlayerState) => {
  const names = Object.keys(player.counters);
  if (!names.some(isManaCounter)) return state;
  const counters = Object.fromEntries(
    Object.entries(player.counters).filter(([name]) => !isManaCounter(name))
  );
  return updatePlayer(state, player.id, { counters });
};

export const reduceCardState = (
  state: GameState,
  action: CardStateAction
): GameState => {
  const player = getPlayer(state, action.playerId);
  if (!player) return state;
  switch (action.type) {
    case 'setCardState':
      return setCardState(state, player, action);
    case 'emptyManaPool':
      return emptyPool(state, player);
  }
};
