import { currentFace } from './cardRefs';
import {
  cascadePosition,
  detachFrom,
  getPlayer,
  moveCard,
  type Rules,
  shuffleLibrary,
  updateZone,
} from './core';
import type {
  CardInstance,
  ControlAction,
  GainControlAction,
  GameAction,
  GameState,
  GiveControlAction,
  InstanceId,
  LentCard,
  PermanentState,
  PlayerId,
  RegainControlAction,
  ZoneId,
} from './types';

// A permanent lives in two games while someone else controls it: set
// aside in its owner's, and as a borrowed copy on the controller's
// battlefield, gone from their game the moment it leaves that zone.

const controlActionTypes: ReadonlySet<string> = new Set<ControlAction['type']>([
  'giveControl',
  'gainControl',
  'releaseControl',
  'regainControl',
]);

export const isControlAction = (action: GameAction): action is ControlAction =>
  controlActionTypes.has(action.type);

// What changed hands, told to the other game involved.
export type ControlChange =
  // Owner to the new controller.
  | { op: 'give'; card: LentCard }
  // Controller to the owner: the card left their battlefield.
  | {
      op: 'return';
      instanceId: InstanceId;
      to: ZoneId;
      index?: number;
      shuffle?: boolean;
      state: PermanentState;
    }
  // Owner to a controller: every card of theirs is void (a new game).
  | { op: 'recall' };

// A borrowed card's owner is never a player in the game holding it.
export const isBorrowed = (state: GameState, card: CardInstance) =>
  !getPlayer(state, card.owner);

// A local owner's permanent that someone else controls.
export const isLent = (state: GameState, card: CardInstance) =>
  card.zone === 'battlefield' &&
  card.controller !== card.owner &&
  getPlayer(state, card.owner) !== undefined;

export const borrowedFrom = (
  state: GameState,
  owner?: PlayerId
): CardInstance[] =>
  Object.values(state.cards).filter(
    (card) =>
      isBorrowed(state, card) && (owner === undefined || card.owner === owner)
  );

export const lentTo = (
  state: GameState,
  controller?: PlayerId
): CardInstance[] =>
  Object.values(state.cards).filter(
    (card) =>
      isLent(state, card) &&
      (controller === undefined || card.controller === controller)
  );

export const permanentState = (
  card: PermanentState & Pick<CardInstance, 'isCommander'>
): PermanentState => ({
  tapped: card.tapped,
  faceDown: card.faceDown,
  faceIndex: card.faceIndex,
  counters: { ...card.counters },
  ...(card.isCommander && { commanderCasts: card.commanderCasts ?? 0 }),
});

export const lentCard = (card: CardInstance): LentCard => ({
  ...permanentState(card),
  instanceId: card.instanceId,
  ref: card.ref,
  isToken: card.isToken,
  ...(card.isCommander && { isCommander: true }),
});

// How the card reads in a log everyone sees.
export const publicName = (card: Pick<CardInstance, 'ref'> & PermanentState) =>
  card.faceDown
    ? 'a face-down card'
    : (currentFace(card.ref, card.faceIndex)?.name ?? card.ref.name);

const validFace = (card: LentCard | CardInstance, faceIndex: number) =>
  faceIndex < card.ref.faces.length ? faceIndex : 0;

const withState = (card: CardInstance, state: PermanentState) => ({
  ...card,
  tapped: state.tapped,
  faceDown: state.faceDown,
  faceIndex: validFace(card, state.faceIndex),
  counters: { ...state.counters },
  ...(card.isCommander && {
    commanderCasts: state.commanderCasts ?? card.commanderCasts ?? 0,
  }),
});

const giveControl = (
  state: GameState,
  { instanceId, to }: GiveControlAction
): GameState => {
  const card = state.cards[instanceId];
  if (
    !card ||
    card.zone !== 'battlefield' ||
    card.controller !== card.owner ||
    to === card.owner ||
    isBorrowed(state, card)
  ) {
    return state;
  }

  // Attachments don't cross between games: both sides let go.
  const aside = updateZone(state, card.owner, 'battlefield', (ids) =>
    ids.filter((id) => id !== instanceId)
  );
  const taken = getPlayer(aside, to)
    ? updateZone(aside, to, 'battlefield', (ids) => [...ids, instanceId])
    : aside;
  return detachFrom(
    {
      ...taken,
      cards: {
        ...taken.cards,
        [instanceId]: { ...card, controller: to, attachedTo: null },
      },
    },
    instanceId
  );
};

const gainControl = (
  state: GameState,
  { playerId, owner, card }: GainControlAction
): GameState => {
  const player = getPlayer(state, playerId);
  if (
    !player ||
    owner === playerId ||
    getPlayer(state, owner) ||
    state.cards[card.instanceId]
  ) {
    return state;
  }

  const gained: CardInstance = {
    instanceId: card.instanceId,
    ref: card.ref,
    owner,
    controller: playerId,
    zone: 'battlefield',
    position: cascadePosition(player.zones.battlefield.length),
    tapped: card.tapped,
    faceDown: card.faceDown,
    faceIndex: validFace(card, card.faceIndex),
    counters: { ...card.counters },
    isToken: card.isToken,
    ...(card.isCommander && {
      isCommander: true,
      commanderCasts: card.commanderCasts ?? 0,
    }),
    attachedTo: null,
  };
  const placed = updateZone(state, playerId, 'battlefield', (ids) => [
    ...ids,
    card.instanceId,
  ]);
  return {
    ...placed,
    cards: { ...placed.cards, [card.instanceId]: gained },
  };
};

const releaseControl = (
  state: GameState,
  instanceIds: InstanceId[]
): GameState =>
  instanceIds.reduce((next, instanceId) => {
    const card = next.cards[instanceId];
    if (!card || !isBorrowed(next, card)) return next;
    const removed = updateZone(next, card.controller, 'battlefield', (ids) =>
      ids.filter((id) => id !== instanceId)
    );
    const cards = { ...removed.cards };
    delete cards[instanceId];
    return detachFrom({ ...removed, cards }, instanceId);
  }, state);

const regainControl = (
  state: GameState,
  action: RegainControlAction,
  rules: Rules
): GameState => {
  const card = state.cards[action.instanceId];
  if (!card || !isLent(state, card)) return state;

  // Off the controller's battlefield, if they are at this table too.
  const freed = updateZone(state, card.controller, 'battlefield', (ids) =>
    ids.filter((id) => id !== card.instanceId)
  );
  const owner = getPlayer(freed, card.owner);
  if (!owner) return state;

  if (action.to === 'battlefield') {
    const back = {
      ...withState(card, action.state),
      controller: card.owner,
      attachedTo: null,
      position: cascadePosition(owner.zones.battlefield.length),
    };
    const placed = updateZone(freed, card.owner, 'battlefield', (ids) => [
      ...ids,
      card.instanceId,
    ]);
    return {
      ...placed,
      cards: { ...placed.cards, [card.instanceId]: back },
    };
  }

  // Leaving the battlefield: the rules hand it back to its owner as a
  // new object, into the owner's own zone.
  const moved = moveCard(freed, rules, card.instanceId, action.to, {
    index: action.index,
  });
  return action.shuffle && action.to === 'library'
    ? shuffleLibrary(moved, card.owner)
    : moved;
};

export const reduceControl = (
  state: GameState,
  action: ControlAction,
  rules: Rules
): GameState => {
  switch (action.type) {
    case 'giveControl':
      return giveControl(state, action);
    case 'gainControl':
      return gainControl(state, action);
    case 'releaseControl':
      return releaseControl(state, action.instanceIds);
    case 'regainControl':
      return regainControl(state, action, rules);
  }
};

// A borrowed permanent an action took out of this game, and where to.
export interface Departure {
  card: CardInstance;
  change: Extract<ControlChange, { op: 'return' }>;
}

const destination = (
  action: GameAction,
  instanceId: InstanceId
): Pick<Departure['change'], 'to' | 'index' | 'shuffle'> => {
  if (action.type === 'moveCard' && action.instanceId === instanceId) {
    return {
      to: action.to,
      ...(action.index !== undefined && { index: action.index }),
    };
  }
  if (action.type === 'shuffleIntoLibrary') {
    return { to: 'library', shuffle: true };
  }
  return { to: 'battlefield' };
};

// Borrowed permanents that were in before but not after, each with the
// return its owner needs to put it where the action sent it.
export const departures = (
  before: GameState,
  action: GameAction,
  after: GameState
): Departure[] =>
  borrowedFrom(before)
    .filter((card) => !after.cards[card.instanceId])
    .map((card) => ({
      card,
      change: {
        op: 'return',
        instanceId: card.instanceId,
        ...destination(action, card.instanceId),
        state: permanentState(card),
      },
    }));

const ownerZone: Record<ZoneId, (owner: string) => string> = {
  battlefield: (owner) => `back to ${owner}`,
  graveyard: (owner) => `into ${owner}'s graveyard`,
  exile: () => 'into exile',
  command: (owner) => `into ${owner}'s command zone`,
  hand: (owner) => `into ${owner}'s hand`,
  library: (owner) => `into ${owner}'s library`,
};

// Log lines, told by the player whose game changed.
export const describeDeparture = (
  { card, change }: Departure,
  ownerName: string
): string => {
  const name = publicName(card);
  if (change.to === 'battlefield') return `returned ${name} to ${ownerName}`;
  if (change.shuffle) {
    return `shuffled ${name} into ${ownerName}'s library`;
  }
  if (change.to === 'library') {
    const where = change.index === 0 ? 'on top of' : 'on the bottom of';
    return `put ${name} ${where} ${ownerName}'s library`;
  }
  return `put ${name} ${ownerZone[change.to](ownerName)}`;
};

const ownZone: Record<ZoneId, string> = {
  battlefield: 'onto their battlefield',
  graveyard: 'into their graveyard',
  exile: 'into exile',
  command: 'into their command zone',
  hand: 'into their hand',
  library: 'into their library',
};

// The owner's side of a return; the card is named as it was when it left
// the other player's battlefield.
export const describeRegain = (
  card: CardInstance,
  change: Extract<ControlChange, { op: 'return' }>,
  fromName: string
): string => {
  const name = publicName({ ref: card.ref, ...change.state });
  return change.to === 'battlefield'
    ? `got ${name} back from ${fromName}`
    : `got ${name} back from ${fromName}, ${ownZone[change.to]}`;
};
