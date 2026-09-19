import {
  type CardView,
  type CommanderDamage,
  type DummyOpponent,
  parseCardRef,
  type Phase,
  phases,
  type PlayerId,
  type Position,
  type PublicView,
  type PublicZoneId,
  type RevealSource,
  type RevealView,
} from '../game';

// 2 added pods (roster, relayed messages) and host-rolled dice.
export const PROTOCOL_VERSION = 2;

// The host plus up to three guests.
export const MAX_SEATS = 4;
export const HOST_SEAT = 1;

export const MAX_DIE_SIDES = 1000;

export const MAX_LOG_TEXT = 300;

// A 60-card battlefield is about 20 KB; this leaves room for big boards
// and stays under the datachannel's own message limit.
export const MAX_MESSAGE_BYTES = 256 * 1024;

export interface PeerInfo {
  playerId: PlayerId;
  name: string;
  appVersion: string;
}

export interface RosterEntry {
  playerId: PlayerId;
  name: string;
  seat: number;
}

export type RollRequest = { type: 'die'; sides: number } | { type: 'coin' };

export type RollResult =
  | { type: 'die'; sides: number; result: number }
  | { type: 'coin'; result: 'heads' | 'tails' };

// Shared randomness: only the host rolls, for whoever asked.
export interface TableEvent {
  id: number;
  by: PlayerId;
  byName: string;
  roll: RollResult;
}

interface Envelope {
  v: typeof PROTOCOL_VERSION;
  // Per sender and connection; receivers drop anything not newer.
  seq: number;
  from: PlayerId;
}

export type NetPayload =
  | ({ kind: 'hello' } & PeerInfo)
  // The sender's whole public view; null when they have no game open.
  | { kind: 'public'; view: PublicView | null }
  | { kind: 'bye' }
  // Host only: everyone in the pod, including the receiver.
  | { kind: 'roster'; players: RosterEntry[] }
  // To the host only; never relayed.
  | { kind: 'roll'; request: RollRequest }
  // Host only: the outcome of a roll, for everyone.
  | ({ kind: 'event' } & TableEvent)
  // One line of the sender's action log, built from public information.
  // Added within v2: older v2 builds drop it as an unknown kind.
  | { kind: 'log'; text: string };

export type NetMessage = Envelope & NetPayload;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(`bad message: ${message}`);
    this.name = 'ProtocolError';
  }
}

type Fields = Record<string, unknown>;

// A peer on another protocol version; worth telling the user about.
export class VersionError extends ProtocolError {
  constructor(readonly version: unknown) {
    super(`unsupported version ${JSON.stringify(version)}`);
    this.name = 'VersionError';
  }
}

const fail = (message: string): never => {
  throw new ProtocolError(message);
};

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (value: unknown, what: string): Fields =>
  isObject(value) ? value : fail(`${what} must be an object`);

const text = (
  fields: Fields,
  key: string,
  { max = 200, allowEmpty = false } = {}
): string => {
  const value = fields[key];
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!allowEmpty && value.length === 0)
  ) {
    return fail(`${key} must be a string of at most ${max} chars`);
  }
  return value;
};

const int = (fields: Fields, key: string, min: number, max: number) => {
  const value = fields[key];
  if (!Number.isInteger(value) || (value as number) < min) {
    return fail(`${key} must be an integer in ${min}..${max}`);
  }
  if ((value as number) > max) return fail(`${key} is larger than ${max}`);
  return value as number;
};

const bool = (fields: Fields, key: string): boolean =>
  typeof fields[key] === 'boolean'
    ? (fields[key] as boolean)
    : fail(`${key} must be a boolean`);

const list = (value: unknown, key: string, max: number): unknown[] =>
  Array.isArray(value) && value.length <= max
    ? value
    : fail(`${key} must be an array of at most ${max} items`);

const MAX_ZONE_CARDS = 500;
const MAX_COUNT = 1000;
const MAX_LIFE = 1_000_000;
const MAX_COORD = 100_000;

const counters = (fields: Fields, key: string): Record<string, number> => {
  const value = object(fields[key], key);
  const entries = Object.entries(value);
  if (entries.length > 50) fail(`${key} has too many entries`);
  return Object.fromEntries(
    entries.map(([name]) => {
      if (name.length === 0 || name.length > 40) fail(`${key} name`);
      return [name, int(value, name, 0, MAX_LIFE)];
    })
  );
};

const position = (value: unknown): Position | null => {
  if (value === null) return null;
  const fields = object(value, 'position');
  const coord = (key: 'x' | 'y') => {
    const n = fields[key];
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return fail(`position.${key} must be a finite number`);
    }
    return Math.max(-MAX_COORD, Math.min(MAX_COORD, n));
  };
  return { x: coord('x'), y: coord('y') };
};

// Optional so views from builds without attachments still parse.
const attachedTo = (fields: Fields, zone: PublicZoneId): string | null => {
  const value = fields.attachedTo;
  if (value === undefined || value === null) return null;
  const host = text(fields, 'attachedTo');
  return zone === 'battlefield' ? host : null;
};

const cardView = (value: unknown, zone: PublicZoneId): CardView => {
  const fields = object(value, 'card');
  if (fields.zone !== zone) fail(`card in ${zone} claims another zone`);
  const faceDown = bool(fields, 'faceDown');
  return {
    instanceId: text(fields, 'instanceId'),
    // A face-down card's identity is never shown, whatever the peer sent.
    ref:
      faceDown || fields.ref === null ? null : parseCardRef(fields.ref, fail),
    owner: text(fields, 'owner'),
    controller: text(fields, 'controller'),
    zone,
    position: zone === 'battlefield' ? position(fields.position) : null,
    tapped: bool(fields, 'tapped'),
    faceDown,
    faceIndex: faceDown ? 0 : int(fields, 'faceIndex', 0, 3),
    counters: counters(fields, 'counters'),
    isToken: bool(fields, 'isToken'),
    attachedTo: attachedTo(fields, zone),
    ...(fields.isCommander !== undefined &&
      bool(fields, 'isCommander') && {
        isCommander: true,
        commanderCasts: int(fields, 'commanderCasts', 0, MAX_COUNT),
      }),
  };
};

const MAX_DAMAGE_SOURCES = 50;
const MAX_DUMMIES = 8;

// Views from builds without commander support simply have none.
const optionalList = (value: unknown, key: string, max: number) =>
  value === undefined ? [] : list(value, key, max);

const commanderDamage = (value: unknown): CommanderDamage[] =>
  optionalList(value, 'commanderDamage', MAX_DAMAGE_SOURCES).map((item) => {
    const fields = object(item, 'commanderDamage');
    return {
      source: text(fields, 'source'),
      name: text(fields, 'name'),
      damage: int(fields, 'damage', 0, MAX_LIFE),
    };
  });

const dummy = (value: unknown): DummyOpponent => {
  const fields = object(value, 'dummy');
  return {
    id: text(fields, 'id', { max: 64 }),
    name: text(fields, 'name', { max: 64 }),
    life: int(fields, 'life', -MAX_LIFE, MAX_LIFE),
    commanderDamage: commanderDamage(fields.commanderDamage),
  };
};

const MAX_TURN = 100_000;
const MAX_REVEALED = 100;
const revealSources: readonly RevealSource[] = ['hand', 'libraryTop', 'card'];

// Turn and phase are optional, for views from builds without them.
const turnFields = (fields: Fields): { turn?: number; phase?: Phase } => ({
  ...(fields.turn !== undefined && { turn: int(fields, 'turn', 0, MAX_TURN) }),
  ...(fields.phase !== undefined && {
    phase: (phases as readonly unknown[]).includes(fields.phase)
      ? (fields.phase as Phase)
      : fail('phase is unknown'),
  }),
});

const revealed = (value: unknown): RevealView | null => {
  if (value === null) return null;
  const fields = object(value, 'revealed');
  if (!(revealSources as readonly unknown[]).includes(fields.source)) {
    fail('revealed.source is unknown');
  }
  return {
    source: fields.source as RevealSource,
    cards: list(fields.cards, 'revealed.cards', MAX_REVEALED).map((ref) =>
      parseCardRef(ref, fail)
    ),
  };
};

const publicZones: PublicZoneId[] = [
  'battlefield',
  'graveyard',
  'exile',
  'command',
];

// Rebuilds a peer's view from known fields only, so nothing unexpected
// reaches the board.
export const parsePublicView = (value: unknown): PublicView => {
  const fields = object(value, 'view');
  const zones = object(fields.zones, 'zones');
  return {
    seq: int(fields, 'seq', 0, Number.MAX_SAFE_INTEGER),
    playerId: text(fields, 'playerId'),
    name: text(fields, 'name', { max: 64 }),
    life: int(fields, 'life', -MAX_LIFE, MAX_LIFE),
    counters: counters(fields, 'counters'),
    mulligans: int(fields, 'mulligans', 0, MAX_COUNT),
    keptHand: bool(fields, 'keptHand'),
    zones: Object.fromEntries(
      publicZones.map((zone) => [
        zone,
        list(zones[zone], zone, MAX_ZONE_CARDS).map((card) =>
          cardView(card, zone)
        ),
      ])
    ) as Record<PublicZoneId, CardView[]>,
    handCount: int(fields, 'handCount', 0, MAX_COUNT),
    libraryCount: int(fields, 'libraryCount', 0, MAX_COUNT),
    commanderDamage: commanderDamage(fields.commanderDamage),
    dummies: optionalList(fields.dummies, 'dummies', MAX_DUMMIES).map(dummy),
    ...turnFields(fields),
    ...(fields.revealed !== undefined && {
      revealed: revealed(fields.revealed),
    }),
  };
};

const roster = (value: unknown): RosterEntry[] => {
  const players = list(value, 'players', MAX_SEATS).map((item) => {
    const fields = object(item, 'player');
    return {
      playerId: text(fields, 'playerId'),
      name: text(fields, 'name', { max: 64 }),
      seat: int(fields, 'seat', HOST_SEAT, MAX_SEATS),
    };
  });
  const unique = (key: 'playerId' | 'seat') =>
    new Set(players.map((p) => p[key])).size === players.length;
  if (!unique('playerId') || !unique('seat')) fail('roster has duplicates');
  return players;
};

const dieSides = (fields: Fields) => int(fields, 'sides', 2, MAX_DIE_SIDES);

export const parseRollRequest = (value: unknown): RollRequest => {
  const fields = object(value, 'request');
  switch (fields.type) {
    case 'die':
      return { type: 'die', sides: dieSides(fields) };
    case 'coin':
      return { type: 'coin' };
    default:
      return fail('unknown roll');
  }
};

const rollResult = (value: unknown): RollResult => {
  const fields = object(value, 'roll');
  switch (fields.type) {
    case 'die': {
      const sides = dieSides(fields);
      return { type: 'die', sides, result: int(fields, 'result', 1, sides) };
    }
    case 'coin':
      if (fields.result !== 'heads' && fields.result !== 'tails') {
        return fail('a coin lands heads or tails');
      }
      return { type: 'coin', result: fields.result };
    default:
      return fail('unknown roll');
  }
};

// Log lines are shown as plain text on every board; keep them one short
// line whatever the sender put in.
export const cleanLogText = (value: string): string => {
  const line = value.replace(/\p{Cc}+/gu, ' ').trim();
  return line.length > MAX_LOG_TEXT
    ? `${line.slice(0, MAX_LOG_TEXT - 1)}…`
    : line;
};

const byteLength = (raw: string) => new TextEncoder().encode(raw).length;

export const parseNetMessage = (raw: unknown): NetMessage => {
  if (typeof raw !== 'string') return fail('not text');
  if (raw.length > MAX_MESSAGE_BYTES || byteLength(raw) > MAX_MESSAGE_BYTES) {
    return fail(`larger than ${MAX_MESSAGE_BYTES} bytes`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('not JSON');
  }
  const fields = object(parsed, 'message');
  if (fields.v !== PROTOCOL_VERSION) throw new VersionError(fields.v);
  const envelope: Envelope = {
    v: PROTOCOL_VERSION,
    seq: int(fields, 'seq', 1, Number.MAX_SAFE_INTEGER),
    from: text(fields, 'from'),
  };

  switch (fields.kind) {
    case 'hello': {
      const playerId = text(fields, 'playerId');
      if (playerId !== envelope.from) fail('hello is for another player');
      return {
        ...envelope,
        kind: 'hello',
        playerId,
        name: text(fields, 'name', { max: 64 }),
        appVersion: text(fields, 'appVersion', { max: 64 }),
      };
    }
    case 'public': {
      const view = fields.view === null ? null : parsePublicView(fields.view);
      if (view && view.playerId !== envelope.from) {
        fail('public view is for another player');
      }
      return { ...envelope, kind: 'public', view };
    }
    case 'bye':
      return { ...envelope, kind: 'bye' };
    case 'roster':
      return { ...envelope, kind: 'roster', players: roster(fields.players) };
    case 'roll':
      return {
        ...envelope,
        kind: 'roll',
        request: parseRollRequest(fields.request),
      };
    case 'event':
      return {
        ...envelope,
        kind: 'event',
        id: int(fields, 'id', 1, Number.MAX_SAFE_INTEGER),
        by: text(fields, 'by'),
        byName: text(fields, 'byName', { max: 64 }),
        roll: rollResult(fields.roll),
      };
    case 'log': {
      const line = cleanLogText(text(fields, 'text', { max: MAX_LOG_TEXT }));
      if (line.length === 0) fail('log text is empty');
      return { ...envelope, kind: 'log', text: line };
    }
    default:
      return fail(`unknown kind ${JSON.stringify(fields.kind)}`);
  }
};

export const encodeNetMessage = (message: NetMessage): string =>
  JSON.stringify(message);

// Remote instance ids get the peer's prefix so they can never collide with
// local ones, in React keys or anywhere else.
export const namespaceView = (
  view: PublicView,
  peerId: PlayerId
): PublicView => ({
  ...view,
  zones: Object.fromEntries(
    Object.entries(view.zones).map(([zone, cards]) => [
      zone,
      cards.map((card) => ({
        ...card,
        instanceId: `${peerId}/${card.instanceId}`,
        attachedTo: card.attachedTo && `${peerId}/${card.attachedTo}`,
      })),
    ])
  ) as Record<PublicZoneId, CardView[]>,
});
