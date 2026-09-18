import { parseCardRef } from './cardRefs';
import type {
  GameState,
  PlayerAction,
  PlayerId,
  Position,
  ZoneId,
} from './types';
import { MAX_TOKENS } from './mtg';
import { zoneIds } from './types';

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

const MAX_COUNT = 1000;
const MAX_LIFE = 1_000_000;
const MAX_COUNTER_NAME = 40;

const bool = (fields: Fields, key: string): boolean =>
  typeof fields[key] === 'boolean'
    ? (fields[key] as boolean)
    : fail(`${key} must be a boolean`);

// Counter names are free text typed by the player, so trim and bound them.
const counterName = (fields: Fields, key: string): string => {
  const value = fields[key];
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > MAX_COUNTER_NAME) {
    return fail(`${key} must be 1-${MAX_COUNTER_NAME} chars`);
  }
  return name;
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
    case 'moveCard':
      return {
        type: 'moveCard',
        instanceId: string(input, 'instanceId'),
        to: zone(input, 'to'),
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
    default:
      return fail(`unknown type ${JSON.stringify(input.type)}`);
  }
};

// The player an action would change, so a store can refuse actions on
// cards or players it is not authoritative for.
export const actionPlayer = (
  state: GameState,
  action: PlayerAction
): PlayerId | null => {
  if ('playerId' in action) return action.playerId;
  const card = state.cards[action.instanceId];
  if (!card) return null;
  return card.zone === 'battlefield' ? card.controller : card.owner;
};
