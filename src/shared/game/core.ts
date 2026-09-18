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

const updateZone = (
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

const newGame = (state: GameState, action: NewGameAction): GameState => {
  const cards: Record<InstanceId, CardInstance> = {};
  let nextInstanceId = 0;

  const place = (ref: CardRef, owner: PlayerId, zone: ZoneId) => {
    const instanceId = `${owner}:${nextInstanceId}`;
    nextInstanceId += 1;
    cards[instanceId] = {
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
    };
    return instanceId;
  };

  const players = action.players.map((setup): PlayerState => ({
    id: setup.id,
    name: setup.name,
    life: setup.life ?? 20,
    counters: {},
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

export const moveCard = (
  state: GameState,
  rules: Rules,
  instanceId: InstanceId,
  to: ZoneId,
  options: { index?: number; position?: Position } = {}
): GameState => {
  const card = state.cards[instanceId];
  if (!card) return state;

  const from = card.zone;
  const removed = updateZone(state, zoneHolder(card), from, (ids) =>
    ids.filter((id) => id !== instanceId)
  );

  let moved: CardInstance | null = { ...card, zone: to };
  if (from !== to) moved = rules.onZoneChange(moved, from, to);

  if (!moved) {
    const cards = { ...removed.cards };
    delete cards[instanceId];
    return { ...removed, cards };
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
  return {
    ...placed,
    cards: { ...placed.cards, [instanceId]: { ...moved, position } },
  };
};

export const reduceCore = (
  state: GameState,
  action: CoreAction,
  rules: Rules
): GameState => {
  switch (action.type) {
    case 'newGame':
      return newGame(state, action);

    case 'shuffle': {
      const player = getPlayer(state, action.playerId);
      if (!player) return state;
      const [library, rng] = shuffle(player.zones.library, state.rng);
      return {
        ...updateZone(state, player.id, 'library', () => library),
        rng,
      };
    }

    case 'draw': {
      const player = getPlayer(state, action.playerId);
      if (!player) return state;
      return player.zones.library
        .slice(0, Math.max(0, action.count))
        .reduce(
          (next, instanceId) => moveCard(next, rules, instanceId, 'hand'),
          state
        );
    }

    case 'moveCard':
      return moveCard(state, rules, action.instanceId, action.to, {
        index: action.index,
        position: action.position,
      });

    case 'setPosition': {
      const card = state.cards[action.instanceId];
      if (card?.zone !== 'battlefield') return state;
      // Re-appending puts the card on top of the others it was dropped on.
      return moveCard(state, rules, card.instanceId, 'battlefield', {
        position: action.position,
      });
    }
  }
};
