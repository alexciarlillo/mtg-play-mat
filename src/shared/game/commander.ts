import { getPlayer, type Rules, updatePlayer } from './core';
import type {
  CardInstance,
  CommanderAction,
  CommanderDamage,
  DummyOpponent,
  GameState,
  InstanceId,
  PlayerId,
  PlayerState,
  ZoneId,
} from './types';

export const COMMANDER_STARTING_LIFE = 40;
export const COMMANDER_TAX_PER_CAST = 2;
// Damage from a single commander that loses the game.
export const LETHAL_COMMANDER_DAMAGE = 21;
export const MAX_DUMMIES = 3;

// Zones a commander may be sent back to the command zone from, as its
// owner chooses (graveyard and exile, and hand or library instead).
export const commanderReturnZones: readonly ZoneId[] = [
  'graveyard',
  'exile',
  'hand',
  'library',
];

export const startingLife = (format: string): number =>
  format === 'commander' ? COMMANDER_STARTING_LIFE : 20;

export const commanderTax = (card: {
  isCommander?: boolean;
  commanderCasts?: number;
}): number =>
  card.isCommander ? (card.commanderCasts ?? 0) * COMMANDER_TAX_PER_CAST : 0;

// Wraps another rule set so a commander keeps its identity and cast count
// through every zone change. The count is the player's to set: leaving the
// command zone is not always a cast, and a cast is not always a move.
export const withCommanderRules = (rules: Rules): Rules => ({
  onZoneChange: (card, from, to) => {
    const moved = rules.onZoneChange(card, from, to);
    if (!card.isCommander || !moved) return moved;
    return {
      ...moved,
      isCommander: true,
      commanderCasts: card.commanderCasts ?? 0,
    };
  },
});

// A new game's command zone holds exactly the players' commanders.
export const markCommanders = (state: GameState): GameState => {
  const ids = state.players.flatMap((player) => player.zones.command);
  if (ids.length === 0) return state;
  const cards = { ...state.cards };
  ids.forEach((id) => {
    const card = cards[id];
    if (card) cards[id] = { ...card, isCommander: true, commanderCasts: 0 };
  });
  return { ...state, cards };
};

export interface CommanderMove {
  instanceId: InstanceId;
  name: string;
  zone: ZoneId;
}

// Commanders of one owner that an action just put into a zone they could
// return to the command zone from. The prompt itself is not engine state.
export const commanderMoves = (
  before: GameState,
  after: GameState,
  owner: PlayerId
): CommanderMove[] =>
  Object.values(after.cards)
    .filter(
      (card) =>
        card.isCommander &&
        card.owner === owner &&
        commanderReturnZones.includes(card.zone) &&
        before.cards[card.instanceId]?.zone !== card.zone
    )
    .map((card) => ({
      instanceId: card.instanceId,
      name: card.ref.name,
      zone: card.zone,
    }));

const setDamage = (
  entries: CommanderDamage[],
  source: string,
  name: string,
  delta: number
): { entries: CommanderDamage[]; change: number } => {
  const current = entries.find((entry) => entry.source === source);
  const before = current?.damage ?? 0;
  const damage = Math.max(0, before + delta);
  const change = damage - before;
  if (change === 0) return { entries, change };

  const rest = entries.filter((entry) => entry.source !== source);
  if (damage === 0) return { entries: rest, change };
  const updated = { source, name, damage };
  return {
    entries: current
      ? entries.map((entry) => (entry === current ? updated : entry))
      : [...rest, updated],
    change,
  };
};

const updateDummy = (
  state: GameState,
  player: PlayerState,
  dummyId: string,
  update: (dummy: DummyOpponent) => DummyOpponent
): GameState => {
  const dummies = player.dummies ?? [];
  const dummy = dummies.find((d) => d.id === dummyId);
  if (!dummy) return state;
  const next = update(dummy);
  if (next === dummy) return state;
  return updatePlayer(state, player.id, {
    dummies: dummies.map((d) => (d === dummy ? next : d)),
  });
};

const nextDummyId = (dummies: DummyOpponent[]): string => {
  const used = new Set(dummies.map((d) => d.id));
  let n = 1;
  while (used.has(`dummy-${n}`)) n += 1;
  return `dummy-${n}`;
};

const adjustCasts = (
  state: GameState,
  card: CardInstance | undefined,
  delta: number
): GameState => {
  if (!card?.isCommander) return state;
  const before = card.commanderCasts ?? 0;
  const commanderCasts = Math.max(0, before + delta);
  if (commanderCasts === before) return state;
  return {
    ...state,
    cards: {
      ...state.cards,
      [card.instanceId]: { ...card, commanderCasts },
    },
  };
};

export const reduceCommander = (
  state: GameState,
  action: CommanderAction
): GameState => {
  if (action.type === 'adjustCommanderCasts') {
    return adjustCasts(state, state.cards[action.instanceId], action.delta);
  }

  const player = getPlayer(state, action.playerId);
  if (!player) return state;
  const dummies = player.dummies ?? [];

  switch (action.type) {
    case 'adjustCommanderDamage': {
      const { source, sourceName, delta } = action;
      if (action.dummyId === undefined) {
        const { entries, change } = setDamage(
          player.commanderDamage ?? [],
          source,
          sourceName,
          delta
        );
        if (change === 0) return state;
        return updatePlayer(state, player.id, {
          commanderDamage: entries,
          life: player.life - change,
        });
      }
      return updateDummy(state, player, action.dummyId, (dummy) => {
        const { entries, change } = setDamage(
          dummy.commanderDamage,
          source,
          sourceName,
          delta
        );
        if (change === 0) return dummy;
        return {
          ...dummy,
          commanderDamage: entries,
          life: dummy.life - change,
        };
      });
    }

    case 'addDummy': {
      if (dummies.length >= MAX_DUMMIES) return state;
      const commanderGame = Object.values(state.cards).some(
        (card) => card.isCommander && card.owner === player.id
      );
      const life = commanderGame ? COMMANDER_STARTING_LIFE : 20;
      const dummy: DummyOpponent = {
        id: nextDummyId(dummies),
        name: action.name,
        life,
        commanderDamage: [],
      };
      return updatePlayer(state, player.id, { dummies: [...dummies, dummy] });
    }

    case 'removeDummy': {
      const rest = dummies.filter((d) => d.id !== action.dummyId);
      if (rest.length === dummies.length) return state;
      return updatePlayer(state, player.id, { dummies: rest });
    }

    case 'adjustDummyLife':
      return updateDummy(state, player, action.dummyId, (dummy) =>
        action.delta === 0
          ? dummy
          : { ...dummy, life: dummy.life + action.delta }
      );
  }
};
