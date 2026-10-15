import { parseCardRef } from './cardRefs';
import { isControlAction } from './control';
import type {
  CardTypeFilter,
  GameAction,
  GameState,
  NewGameAction,
  Phase,
  PlayerAction,
  PlayerId,
  Position,
  SearchDestination,
  SearchPick,
  ZoneId,
} from './types';
import { MAX_TOKENS } from './mtg';
import { phases, zoneIds } from './types';
import { MAX_REVEALED_CARDS } from './views';

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(`invalid action: ${message}`);
    this.name = 'InvalidActionError';
  }
}

type Fields = Record<string, unknown>;

const fail = (message: string): never => {
  throw new InvalidActionError(message);
};

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const string = (fields: Fields, key: string): string => {
  const value = fields[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    return fail(`${key} must be a non-empty string`);
  }
  return value;
};

const integer = (fields: Fields, key: string, min: number, max: number) => {
  const value = fields[key];
  if (!Number.isInteger(value) || (value as number) < min) {
    return fail(`${key} must be an integer >= ${min}`);
  }
  return Math.min(value as number, max);
};

const signed = (fields: Fields, key: string, limit: number): number => {
  const value = fields[key];
  if (!Number.isInteger(value) || Math.abs(value as number) > limit) {
    return fail(`${key} must be an integer within ±${limit}`);
  }
  return value as number;
};

const strings = (fields: Fields, key: string, max: number): string[] => {
  const value = fields[key];
  if (!Array.isArray(value) || value.length > max) {
    return fail(`${key} must be an array of at most ${max} ids`);
  }
  return value.map((_, i) => string(value as unknown as Fields, String(i)));
};

const zone = (fields: Fields, key: string): ZoneId => {
  const value = fields[key];
  return (zoneIds as readonly unknown[]).includes(value)
    ? (value as ZoneId)
    : fail(`${key} must be one of ${zoneIds.join(', ')}`);
};

const position = (fields: Fields, key: string): Position => {
  const value = fields[key];
  if (
    !isObject(value) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y)
  ) {
    return fail(`${key} must be {x, y} with finite numbers`);
  }
  return { x: value.x as number, y: value.y as number };
};

const oneOf = <T extends string>(
  fields: Fields,
  key: string,
  options: readonly T[]
): T =>
  (options as readonly unknown[]).includes(fields[key])
    ? (fields[key] as T)
    : fail(`${key} must be one of ${options.join(', ')}`);

const searchDestinations: readonly SearchDestination[] = [
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'top',
  'bottom',
];

const MAX_COUNT = 1000;
const MAX_LIFE = 1_000_000;
const MAX_COUNTER_NAME = 40;

const bool = (fields: Fields, key: string): boolean =>
  typeof fields[key] === 'boolean'
    ? (fields[key] as boolean)
    : fail(`${key} must be a boolean`);

// An optional boolean that is only kept when set.
const flag = (fields: Fields, key: string): boolean =>
  fields[key] === undefined ? false : bool(fields, key);

// Counter names are free text typed by the player, so trim and bound them.
const counterName = (fields: Fields, key: string): string => {
  const value = fields[key];
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > MAX_COUNTER_NAME) {
    return fail(`${key} must be 1-${MAX_COUNTER_NAME} chars`);
  }
  return name;
};

const searchPicks = (fields: Fields, key: string): SearchPick[] => {
  const value = fields[key];
  if (!Array.isArray(value) || value.length > MAX_COUNT) {
    return fail(`${key} must be an array of at most ${MAX_COUNT} picks`);
  }
  return value.map((pick: unknown) => {
    if (!isObject(pick)) return fail(`${key} must hold objects`);
    const to = oneOf(pick, 'to', searchDestinations);
    const tapped = flag(pick, 'tapped');
    return {
      instanceId: string(pick, 'instanceId'),
      to,
      ...(tapped && to === 'battlefield' && { tapped }),
    };
  });
};

// At least one card, each named once.
const cardIds = (fields: Fields, key: string): string[] => {
  const ids = strings(fields, key, MAX_COUNT);
  if (ids.length === 0) return fail(`${key} must name a card`);
  if (new Set(ids).size !== ids.length) return fail(`${key} must be distinct`);
  return ids;
};

// Each card at most once, and at least one card.
const positions = (
  fields: Fields,
  key: string
): { instanceId: string; position: Position }[] => {
  const value = fields[key];
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COUNT) {
    return fail(`${key} must be an array of 1 to ${MAX_COUNT} entries`);
  }
  const entries = value.map((entry: unknown) =>
    isObject(entry)
      ? {
          instanceId: string(entry, 'instanceId'),
          position: position(entry, 'position'),
        }
      : fail(`${key} entries must be objects`)
  );
  const ids = entries.map(({ instanceId }) => instanceId);
  if (new Set(ids).size !== ids.length) return fail(`${key} must be distinct`);
  return entries;
};

const MAX_TYPES = 10;
const MAX_TYPE_NAME = 30;

const typeNames = (fields: Fields, key: string): string[] | undefined => {
  const value = fields[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TYPES) {
    return fail(`${key} must be an array of at most ${MAX_TYPES} types`);
  }
  return value.map((type: unknown) =>
    typeof type === 'string' &&
    type.length <= MAX_TYPE_NAME &&
    /^[A-Za-z]+$/.test(type)
      ? type
      : fail(`${key} must hold single words of 1-${MAX_TYPE_NAME} letters`)
  );
};

const typeFilter = (input: Fields): CardTypeFilter | undefined => {
  const value = input.filter;
  if (value === undefined) return undefined;
  if (!isObject(value)) return fail('filter must be an object');
  const types = typeNames(value, 'types');
  const excludeTypes = typeNames(value, 'excludeTypes');
  return {
    ...(types && types.length > 0 && { types }),
    ...(excludeTypes && excludeTypes.length > 0 && { excludeTypes }),
  };
};

const parseMoveAll = (input: Fields): PlayerAction => {
  const from = zone(input, 'from');
  const to = zone(input, 'to');
  if (from === to) return fail('from and to must differ');
  const parsed = typeFilter(input);
  const filter = parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
  // Picking hidden cards by type would tell the table what they are.
  if (filter && (from === 'hand' || from === 'library')) {
    return fail('a filter needs a public zone to move from');
  }
  return {
    type: 'moveAll',
    playerId: string(input, 'playerId'),
    from,
    to,
    ...(filter && { filter }),
  };
};

// Each card goes back exactly once, and at least one goes back.
const parsePutFromHand = (input: Fields): PlayerAction => {
  const top = strings(input, 'top', MAX_COUNT);
  const bottom = strings(input, 'bottom', MAX_COUNT);
  const ids = [...top, ...bottom];
  if (ids.length === 0) return fail('top or bottom must name a card');
  if (new Set(ids).size !== ids.length) return fail('cards must be distinct');
  return {
    type: 'putFromHand',
    playerId: string(input, 'playerId'),
    top,
    bottom,
  };
};

// Left out when absent or empty, so the action stays as small as before.
const optionalIds = (input: Fields, key: 'battlefield') => {
  if (input[key] === undefined) return {};
  const ids = strings(input, key, MAX_COUNT);
  return ids.length > 0 ? { [key]: ids } : {};
};

const parseReveal = (input: Fields): PlayerAction => {
  const playerId = string(input, 'playerId');
  switch (input.source) {
    case 'hand':
      return { type: 'reveal', playerId, source: 'hand' };
    case 'libraryTop':
      return {
        type: 'reveal',
        playerId,
        source: 'libraryTop',
        count: integer(input, 'count', 1, MAX_REVEALED_CARDS),
      };
    case 'card':
      return {
        type: 'reveal',
        playerId,
        source: 'card',
        instanceId: string(input, 'instanceId'),
      };
    default:
      return fail('source must be one of hand, libraryTop, card');
  }
};

// Actions arrive from renderers, so check their shape and rebuild them from
// known fields only; nothing unexpected reaches the reducer or the log.
export const parsePlayerAction = (input: unknown): PlayerAction => {
  if (!isObject(input)) return fail('not an object');

  switch (input.type) {
    case 'shuffle':
      return { type: 'shuffle', playerId: string(input, 'playerId') };
    case 'draw':
      return {
        type: 'draw',
        playerId: string(input, 'playerId'),
        count: integer(input, 'count', 1, MAX_COUNT),
      };
    case 'moveCard': {
      const to = zone(input, 'to');
      return {
        type: 'moveCard',
        instanceId: string(input, 'instanceId'),
        to,
        ...(input.index !== undefined && {
          index: integer(input, 'index', 0, Number.MAX_SAFE_INTEGER),
        }),
        ...(input.position !== undefined && {
          position: position(input, 'position'),
        }),
        ...(input.faceDown !== undefined && {
          faceDown: bool(input, 'faceDown'),
        }),
        ...(input.faceIndex !== undefined && {
          faceIndex: integer(input, 'faceIndex', 0, 3),
        }),
        ...(flag(input, 'tapped') && to === 'battlefield' && { tapped: true }),
      };
    }
    case 'moveCards': {
      const to = zone(input, 'to');
      return {
        type: 'moveCards',
        playerId: string(input, 'playerId'),
        instanceIds: cardIds(input, 'instanceIds'),
        to,
        ...(input.index !== undefined && {
          index: integer(input, 'index', 0, Number.MAX_SAFE_INTEGER),
        }),
        ...(flag(input, 'tapped') && to === 'battlefield' && { tapped: true }),
      };
    }
    case 'moveAll':
      return parseMoveAll(input);
    case 'setTapped':
      return {
        type: 'setTapped',
        playerId: string(input, 'playerId'),
        instanceIds: cardIds(input, 'instanceIds'),
        tapped: bool(input, 'tapped'),
      };
    case 'setPositions':
      return {
        type: 'setPositions',
        playerId: string(input, 'playerId'),
        positions: positions(input, 'positions'),
      };
    case 'setPosition':
      return {
        type: 'setPosition',
        instanceId: string(input, 'instanceId'),
        position: position(input, 'position'),
      };
    case 'shuffleIntoLibrary':
    case 'tap':
    case 'untap':
    case 'toggleTap':
    case 'copyCard':
    case 'transform':
      return { type: input.type, instanceId: string(input, 'instanceId') };
    case 'adjustCounter':
      return {
        type: 'adjustCounter',
        instanceId: string(input, 'instanceId'),
        counter: counterName(input, 'counter'),
        delta: signed(input, 'delta', MAX_COUNT),
      };
    case 'adjustPlayerCounter':
      return {
        type: 'adjustPlayerCounter',
        playerId: string(input, 'playerId'),
        counter: counterName(input, 'counter'),
        delta: signed(input, 'delta', MAX_COUNT),
      };
    case 'createTokens':
      return {
        type: 'createTokens',
        playerId: string(input, 'playerId'),
        ref: parseCardRef(input.ref, fail),
        count: integer(input, 'count', 1, MAX_TOKENS),
      };
    case 'setFaceDown':
      return {
        type: 'setFaceDown',
        instanceId: string(input, 'instanceId'),
        faceDown: bool(input, 'faceDown'),
      };
    case 'attach':
      return {
        type: 'attach',
        instanceId: string(input, 'instanceId'),
        to: input.to === null ? null : string(input, 'to'),
      };
    case 'untapAll':
    case 'mulligan':
      return { type: input.type, playerId: string(input, 'playerId') };
    case 'adjustLife':
      return {
        type: 'adjustLife',
        playerId: string(input, 'playerId'),
        delta: signed(input, 'delta', MAX_LIFE),
      };
    case 'setLife':
      return {
        type: 'setLife',
        playerId: string(input, 'playerId'),
        life: signed(input, 'life', MAX_LIFE),
      };
    case 'keepHand':
      return {
        type: 'keepHand',
        playerId: string(input, 'playerId'),
        bottom: strings(input, 'bottom', MAX_COUNT),
      };
    case 'adjustCommanderCasts':
      return {
        type: 'adjustCommanderCasts',
        instanceId: string(input, 'instanceId'),
        delta: signed(input, 'delta', MAX_COUNT),
      };
    case 'adjustCommanderDamage':
      return {
        type: 'adjustCommanderDamage',
        playerId: string(input, 'playerId'),
        ...(input.dummyId !== undefined && {
          dummyId: string(input, 'dummyId'),
        }),
        source: string(input, 'source'),
        sourceName: string(input, 'sourceName'),
        delta: signed(input, 'delta', MAX_LIFE),
      };
    case 'addDummy':
      return {
        type: 'addDummy',
        playerId: string(input, 'playerId'),
        name: string(input, 'name').slice(0, 32),
      };
    case 'removeDummy':
      return {
        type: 'removeDummy',
        playerId: string(input, 'playerId'),
        dummyId: string(input, 'dummyId'),
      };
    case 'adjustDummyLife':
      return {
        type: 'adjustDummyLife',
        playerId: string(input, 'playerId'),
        dummyId: string(input, 'dummyId'),
        delta: signed(input, 'delta', MAX_LIFE),
      };
    case 'mill':
      return {
        type: 'mill',
        playerId: string(input, 'playerId'),
        count: integer(input, 'count', 1, MAX_COUNT),
        ...(input.to !== undefined && {
          to: oneOf(input, 'to', ['graveyard', 'exile'] as const),
        }),
      };
    case 'arrangeTop':
      return {
        type: 'arrangeTop',
        playerId: string(input, 'playerId'),
        top: strings(input, 'top', MAX_COUNT),
        bottom: strings(input, 'bottom', MAX_COUNT),
        graveyard: strings(input, 'graveyard', MAX_COUNT),
        exile: strings(input, 'exile', MAX_COUNT),
        hand: strings(input, 'hand', MAX_COUNT),
        ...optionalIds(input, 'battlefield'),
        ...(flag(input, 'bottomRandom') && { bottomRandom: true }),
        ...(flag(input, 'shuffleAfter') && { shuffleAfter: true }),
      };
    case 'searchLibrary':
      return {
        type: 'searchLibrary',
        playerId: string(input, 'playerId'),
        picks: searchPicks(input, 'picks'),
        shuffle: bool(input, 'shuffle'),
      };
    case 'putFromHand':
      return parsePutFromHand(input);
    case 'reveal':
      return parseReveal(input);
    case 'hideReveal':
      return { type: 'hideReveal', playerId: string(input, 'playerId') };
    case 'setTopRevealed':
      return {
        type: 'setTopRevealed',
        playerId: string(input, 'playerId'),
        revealed: bool(input, 'revealed'),
      };
    case 'nextTurn':
      return {
        type: 'nextTurn',
        playerId: string(input, 'playerId'),
        untap: bool(input, 'untap'),
        draw: bool(input, 'draw'),
      };
    case 'setPhase':
      return {
        type: 'setPhase',
        playerId: string(input, 'playerId'),
        phase: oneOf<Phase>(input, 'phase', phases),
      };
    default:
      return fail(`unknown type ${JSON.stringify(input.type)}`);
  }
};

// The player an action would change, so a store can refuse actions on
// cards or players it is not authoritative for. A change of control is
// nobody's to take back, so it has no player.
export const actionPlayer = (
  state: GameState,
  action: Exclude<GameAction, NewGameAction>
): PlayerId | null => {
  if (isControlAction(action)) return null;
  if ('playerId' in action) return action.playerId;
  const card = state.cards[action.instanceId];
  if (!card) return null;
  return card.zone === 'battlefield' ? card.controller : card.owner;
};
