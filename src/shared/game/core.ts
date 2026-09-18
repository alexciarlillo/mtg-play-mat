import { seedRng, shuffle } from './rng';
import type {
  CardInstance,
  CardRef,
  CoreAction,
  GameState,
  InstanceId,
  NewGameAction,
  PlayerId,
  PlayerState,
  Position,
  ZoneId,
} from './types';

// Game-specific rules the generic core defers to.
export interface Rules {
  // Runs when a card changes zones. Returning null removes the card from
  // the game (e.g. a token leaving the battlefield).
  onZoneChange(
    card: CardInstance,
    from: ZoneId,
    to: ZoneId
  ): CardInstance | null;
}

export const emptyGame = (): GameState => ({
  seq: 0,
  players: [],
  cards: {},
  rng: 0,
  nextInstanceId: 0,
  log: [],
});

const emptyZones = (): Record<ZoneId, InstanceId[]> => ({
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  command: [],
});

export const getPlayer = (
  state: GameState,
  playerId: PlayerId
): PlayerState | undefined => state.players.find((p) => p.id === playerId);

// Battlefield cards sit in their controller's zone; all others in their
// owner's.
const zoneHolder = (card: CardInstance): PlayerId =>
  card.zone === 'battlefield' ? card.controller : card.owner;

export const updatePlayer = (
  state: GameState,
  playerId: PlayerId,
  patch: Partial<PlayerState>
): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, ...patch } : player
  ),
});

export const updateZone = (
  state: GameState,
  playerId: PlayerId,
  zone: ZoneId,
  update: (ids: InstanceId[]) => InstanceId[]
): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          zones: { ...player.zones, [zone]: update(player.zones[zone]) },
        }
      : player
  ),
});

const insertAt = <T>(items: T[], item: T, index?: number): T[] => {
  const at =
    index === undefined
      ? items.length
      : Math.max(0, Math.min(items.length, Math.floor(index)));
  return [...items.slice(0, at), item, ...items.slice(at)];
};

// Staggers new battlefield cards so they don't hide one another.
export const cascadePosition = (count: number): Position => ({
  x: (count % 8) * 32,
  y: (count % 8) * 24,
});

const newCard = (
  instanceId: InstanceId,
  ref: CardRef,
  owner: PlayerId,
  zone: ZoneId
): CardInstance => ({
  instanceId,
  ref,
  owner,
  controller: owner,
  zone,
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
});

// Puts new cards (tokens, copies) straight onto a player's battlefield,
// cascading from the cards already there.
export const createOnBattlefield = (
  state: GameState,
  playerId: PlayerId,
  cards: Pick<
    CardInstance,
    'ref' | 'faceDown' | 'faceIndex' | 'isToken' | 'counters'
  >[]
): GameState => {
  const player = getPlayer(state, playerId);
  if (!player || cards.length === 0) return state;

  const count = player.zones.battlefield.length;
  const created = cards.map((card, i): CardInstance => {
    const instanceId = `${playerId}:${state.nextInstanceId + i}`;
    return {
      ...newCard(instanceId, card.ref, playerId, 'battlefield'),
      ...card,
      position: cascadePosition(count + i),
    };
  });

  const placed = updateZone(state, playerId, 'battlefield', (ids) => [
    ...ids,
    ...created.map((card) => card.instanceId),
  ]);
  return {
    ...placed,
    cards: {
      ...placed.cards,
      ...Object.fromEntries(created.map((card) => [card.instanceId, card])),
    },
    nextInstanceId: state.nextInstanceId + created.length,
  };
};

const newGame = (state: GameState, action: NewGameAction): GameState => {
  const cards: Record<InstanceId, CardInstance> = {};
  let nextInstanceId = 0;

  const place = (ref: CardRef, owner: PlayerId, zone: ZoneId) => {
    const card = newCard(`${owner}:${nextInstanceId}`, ref, owner, zone);
    nextInstanceId += 1;
    cards[card.instanceId] = card;
    return card.instanceId;
  };

  const players = action.players.map((setup): PlayerState => ({
    id: setup.id,
    name: setup.name,
    life: setup.life ?? 20,
    counters: {},
    mulligans: 0,
    keptHand: false,
    turn: 1,
    phase: 'main1',
    zones: {
      ...emptyZones(),
      library: setup.deck.map((ref) => place(ref, setup.id, 'library')),
      command: (setup.command ?? []).map((ref) =>
        place(ref, setup.id, 'command')
      ),
    },
  }));

  return {
    seq: state.seq + 1,
    players,
    cards,
    rng: seedRng(action.seed),
    nextInstanceId,
    log: [action],
  };
};

// Cards attached to one that left the battlefield stay where they are,
// but no longer attached to anything.
const detachFrom = (state: GameState, hostId: InstanceId): GameState => {
  const attached = Object.values(state.cards).filter(
    (card) => card.attachedTo === hostId
  );
  if (attached.length === 0) return state;
  const cards = { ...state.cards };
  attached.forEach((card) => {
    cards[card.instanceId] = { ...card, attachedTo: null };
  });
  return { ...state, cards };
};

// Everything attached to a card, directly or through another attachment.
export const attachmentsOf = (
  state: GameState,
  hostId: InstanceId
): CardInstance[] => {
  const direct = Object.values(state.cards).filter(
    (card) => card.attachedTo === hostId && card.zone === 'battlefield'
  );
  return direct.flatMap((card) => [
    card,
    ...attachmentsOf(state, card.instanceId),
  ]);
};

export interface MoveOptions {
  index?: number;
  position?: Position;
  faceDown?: boolean;
  faceIndex?: number;
}

export const moveCard = (
  state: GameState,
  rules: Rules,
  instanceId: InstanceId,
  to: ZoneId,
  options: MoveOptions = {}
): GameState => {
  const card = state.cards[instanceId];
  if (!card) return state;

  const from = card.zone;
  const removed = updateZone(state, zoneHolder(card), from, (ids) =>
    ids.filter((id) => id !== instanceId)
  );

  let moved: CardInstance | null = { ...card, zone: to };
  if (from !== to) {
    // How it enters is known before the rules see it arrive.
    if (to === 'battlefield') {
      moved = {
        ...moved,
        faceDown: options.faceDown ?? moved.faceDown,
        faceIndex: validFace(moved, options.faceIndex),
      };
    }
    moved = rules.onZoneChange({ ...moved, attachedTo: null }, from, to);
  }

  if (!moved) {
    const cards = { ...removed.cards };
    delete cards[instanceId];
    return detachFrom({ ...removed, cards }, instanceId);
  }

  const holder = zoneHolder(moved);
  const onBattlefield =
    getPlayer(removed, holder)?.zones.battlefield.length ?? 0;
  const position =
    to === 'battlefield'
      ? (options.position ??
        (from === 'battlefield' ? card.position : null) ??
        cascadePosition(onBattlefield))
      : null;

  const placed = updateZone(removed, holder, to, (ids) =>
    insertAt(ids, instanceId, options.index)
  );
  const next = {
    ...placed,
    cards: { ...placed.cards, [instanceId]: { ...moved, position } },
  };
  return from === 'battlefield' && to !== 'battlefield'
    ? detachFrom(next, instanceId)
    : next;
};

const validFace = (card: CardInstance, faceIndex?: number) =>
  faceIndex !== undefined && faceIndex < card.ref.faces.length
    ? faceIndex
    : card.faceIndex;

// Moving a permanent carries its attachments along by the same distance.
// Moving an attachment on its own takes it off its host.
const setPosition = (
  state: GameState,
  rules: Rules,
  card: CardInstance,
  position: Position
): GameState => {
  const from = card.position ?? { x: 0, y: 0 };
  const dx = position.x - from.x;
  const dy = position.y - from.y;
  const followers = attachmentsOf(state, card.instanceId);

  // Re-appending puts the card on top of the others it was dropped on.
  const moved = moveCard(state, rules, card.instanceId, 'battlefield', {
    position,
  });
  const cards = { ...moved.cards };
  if (card.attachedTo !== null) {
    cards[card.instanceId] = { ...cards[card.instanceId], attachedTo: null };
  }
  followers.forEach((follower) => {
    const at = follower.position ?? { x: 0, y: 0 };
    cards[follower.instanceId] = {
      ...follower,
      position: { x: at.x + dx, y: at.y + dy },
    };
  });
  return { ...moved, cards };
};

export const shuffleLibrary = (
  state: GameState,
  playerId: PlayerId
): GameState => {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  const [library, rng] = shuffle(player.zones.library, state.rng);
  return { ...updateZone(state, player.id, 'library', () => library), rng };
};

export const drawCards = (
  state: GameState,
  rules: Rules,
  playerId: PlayerId,
  count: number
): GameState =>
  (getPlayer(state, playerId)?.zones.library ?? [])
    .slice(0, Math.max(0, count))
    .reduce(
      (next, instanceId) => moveCard(next, rules, instanceId, 'hand'),
      state
    );

export const reduceCore = (
  state: GameState,
  action: CoreAction,
  rules: Rules
): GameState => {
  switch (action.type) {
    case 'newGame':
      return newGame(state, action);

    case 'shuffle':
      return shuffleLibrary(state, action.playerId);

    case 'draw':
      return drawCards(state, rules, action.playerId, action.count);

    case 'shuffleIntoLibrary': {
      const card = state.cards[action.instanceId];
      if (!card) return state;
      const moved = moveCard(state, rules, card.instanceId, 'library');
      return shuffleLibrary(moved, card.owner);
    }

    case 'moveCard':
      return moveCard(state, rules, action.instanceId, action.to, {
        index: action.index,
        position: action.position,
        faceDown: action.faceDown,
        faceIndex: action.faceIndex,
      });

    case 'setPosition': {
      const card = state.cards[action.instanceId];
      if (card?.zone !== 'battlefield') return state;
      return setPosition(state, rules, card, action.position);
    }
  }
};
