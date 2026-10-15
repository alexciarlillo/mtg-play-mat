import {
  actionPlayer,
  borrowedFrom,
  type CardRef,
  emptyGame,
  type GameAction,
  type GameState,
  type KnownLedger,
  learnFromChange,
  lentTo,
  NO_KNOWLEDGE,
  type NewGameAction,
  parseCardRef,
  parsePlayerAction,
  permanentState,
  type PlayerAction,
  type PlayerId,
  type PlayerSetup,
  reduce,
} from '@shared/game';
import { cleanLogText, parseControlChange } from '@shared/net/protocol';

// Bumped whenever an action's shape changes, since a save is replayed
// through today's reducer and validator.
export const SAVE_VERSION = 1;

const SAVE_KIND = 'mtg-play-mat/game';

// Generous bounds, so a huge or hostile file is refused before replay.
// The writer checks the same bounds, so it never saves what it would
// refuse to load. Undo only ever takes back logged actions.
export const MAX_LOG_ACTIONS = 20_000;
const MAX_REDO = MAX_LOG_ACTIONS;
export const MAX_SAVED_LINES = 500;
const MAX_DECK_CARDS = 1000;
const MAX_NAME = 200;

// One line of the player's own table log, as it was first shown.
export interface SavedLine {
  text: string;
  at: number;
}

// Only what can't be rebuilt: the log replays into the board, and with
// the floor and redo stack it also gives back the undo history.
export interface GameSave {
  kind: typeof SAVE_KIND;
  version: number;
  appVersion: string;
  savedAt: number;
  deckName: string;
  log: GameAction[];
  undoFloor: number;
  redo: PlayerAction[];
  lines: SavedLine[];
}

export interface RestoredGame {
  // Replayed from an empty game; the caller moves seq past its own.
  state: GameState;
  undoFloor: number;
  redo: PlayerAction[];
  lines: SavedLine[];
  known: KnownLedger;
  savedAt: number;
  deckName: string;
}

export class SaveError extends Error {
  constructor(
    message: string,
    // The save comes from another version of the app.
    readonly version = false
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

export const buildSave = ({
  appVersion,
  deckName,
  state,
  undoFloor,
  redo,
  lines,
  now = Date.now(),
}: {
  appVersion: string;
  deckName: string;
  state: GameState;
  undoFloor: number;
  redo: readonly PlayerAction[];
  lines: readonly SavedLine[];
  now?: number;
}): GameSave => ({
  kind: SAVE_KIND,
  version: SAVE_VERSION,
  appVersion,
  savedAt: now,
  deckName,
  log: state.log,
  undoFloor,
  redo: [...redo],
  lines: lines.slice(-MAX_SAVED_LINES),
});

type Fields = Record<string, unknown>;

const fail = (message: string): never => {
  throw new SaveError(message);
};

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (value: unknown, what: string): Fields =>
  isObject(value) ? value : fail(`${what} must be an object`);

const list = (value: unknown, what: string, max: number): unknown[] =>
  Array.isArray(value) && value.length <= max
    ? value
    : fail(`${what} must be a list of at most ${max}`);

const text = (fields: Fields, key: string, max = MAX_NAME): string => {
  const value = fields[key];
  return typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : fail(`${key} must be a short string`);
};

const integer = (fields: Fields, key: string, min: number, max: number) => {
  const value = fields[key];
  return Number.isSafeInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
    ? (value as number)
    : fail(`${key} must be an integer in ${min}..${max}`);
};

const time = (fields: Fields, key: string): number => {
  const value = fields[key];
  return Number.isFinite(value) && (value as number) >= 0
    ? (value as number)
    : fail(`${key} must be a time`);
};

const refs = (value: unknown, what: string): CardRef[] =>
  list(value, what, MAX_DECK_CARDS).map((ref) => parseCardRef(ref, fail));

const optionalRefs = (fields: Fields, key: string) =>
  fields[key] === undefined ? {} : { [key]: refs(fields[key], key) };

// The game's setup is main's to write, so no window parser covers it.
const parseNewGame = (value: unknown, playerId: PlayerId): NewGameAction => {
  const fields = object(value, 'the first action');
  if (fields.type !== 'newGame') fail('the log must start with a new game');
  const players = list(fields.players, 'players', 1);
  const setup = object(players[0], 'player');
  if (setup.id !== playerId) fail('the game is another player’s');
  const player: PlayerSetup = {
    id: playerId,
    name: text(setup, 'name'),
    deck: refs(setup.deck, 'deck'),
    ...optionalRefs(setup, 'command'),
    ...optionalRefs(setup, 'companion'),
    ...optionalRefs(setup, 'sideboard'),
    ...(setup.life !== undefined && {
      life: integer(setup, 'life', -1_000_000, 1_000_000),
    }),
  };
  return {
    type: 'newGame',
    seed: integer(fields, 'seed', 0, 2 ** 32),
    players: [player],
  };
};

// A player's id is new every launch, and their cards' instance ids start
// with it, so a save is moved onto this launch's id before it's parsed.
const rebase = (value: unknown, from: string, to: string): unknown => {
  if (typeof value === 'string') {
    if (value === from) return to;
    return value.startsWith(`${from}:`)
      ? `${to}${value.slice(from.length)}`
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => rebase(item, from, to));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      rebase(key, from, to) as string,
      rebase(item, from, to),
    ])
  );
};

const savedPlayer = (first: unknown): string => {
  const fields = object(first, 'the first action');
  return text(object(list(fields.players, 'players', 1)[0], 'player'), 'id');
};

// Changes of control came from other games, checked like their messages.
const parseControlAction = (
  fields: Fields,
  playerId: PlayerId
): GameAction | null => {
  switch (fields.type) {
    case 'giveControl':
      return {
        type: 'giveControl',
        instanceId: text(fields, 'instanceId'),
        to: text(fields, 'to'),
      };
    case 'gainControl': {
      if (fields.playerId !== playerId) fail('gainControl is not ours');
      const owner = text(fields, 'owner');
      const change = parseControlChange(
        { op: 'give', card: fields.card },
        owner
      );
      if (change.op !== 'give') return fail('gainControl has no card');
      return { type: 'gainControl', playerId, owner, card: change.card };
    }
    case 'releaseControl':
      return {
        type: 'releaseControl',
        instanceIds: list(fields.instanceIds, 'instanceIds', MAX_DECK_CARDS)
          .map((_, i) => text(fields.instanceIds as Fields, String(i)))
          .filter((id, i, all) => all.indexOf(id) === i),
      };
    case 'regainControl': {
      const change = parseControlChange({ ...fields, op: 'return' }, '');
      if (change.op !== 'return') return fail('regainControl is malformed');
      const { op: _op, ...rest } = change;
      return { type: 'regainControl', ...rest };
    }
    default:
      return null;
  }
};

const parseAction = (value: unknown, playerId: PlayerId): GameAction => {
  const fields = object(value, 'action');
  return parseControlAction(fields, playerId) ?? parsePlayerAction(fields);
};

// Lines are shown, never replayed, so a long one is cut rather than
// making the whole save unusable.
const parseLine = (value: unknown): SavedLine => {
  const fields = object(value, 'line');
  const raw = fields.text;
  const line = typeof raw === 'string' ? cleanLogText(raw) : '';
  return line ? { text: line, at: time(fields, 'at') } : fail('empty line');
};

// Whether a game can still be saved in full.
export const fitsSave = (state: GameState) =>
  state.log.length <= MAX_LOG_ACTIONS;

// Replays the log one step at a time. Every logged action changed the
// game when it was played, so one that changes nothing now means the
// save doesn't match this app's rules, and nothing of it is used.
const replaySave = (log: GameAction[], playerId: PlayerId) => {
  let state = emptyGame();
  let known = NO_KNOWLEDGE;
  log.forEach((action, i) => {
    if (i > 0) {
      if (action.type === 'newGame') throw new SaveError('a second new game');
      const player = actionPlayer(state, action);
      if (player !== null && player !== playerId) {
        fail(`action ${i} is another player’s`);
      }
    }
    const next = reduce(state, action);
    if (next === state) fail(`action ${i} (${action.type}) did nothing`);
    if (i > 0) known = learnFromChange(known, state, next, playerId);
    state = next;
  });
  return { state, known };
};

// A save cut short mid-game may still hold another player's permanent,
// or lack one of its own; both go home here, quietly, since the other
// games have long since taken theirs back.
const settle = (state: GameState): GameState => {
  const borrowed = borrowedFrom(state).map((card) => card.instanceId);
  let next =
    borrowed.length > 0
      ? reduce(state, { type: 'releaseControl', instanceIds: borrowed })
      : state;
  lentTo(next).forEach((card) => {
    next = reduce(next, {
      type: 'regainControl',
      instanceId: card.instanceId,
      to: 'battlefield',
      state: permanentState(card),
    });
  });
  return next;
};

// Parses a save file's JSON and rebuilds the game from it. Throws a
// SaveError for anything it can't use in full; never returns a part.
export const restoreSave = (
  raw: unknown,
  { playerId, playerName }: { playerId: PlayerId; playerName: string }
): RestoredGame => {
  try {
    const fields = object(raw, 'save');
    if (fields.kind !== SAVE_KIND) fail('not a saved game');
    if (!Number.isSafeInteger(fields.version)) fail('it has no format');
    if (fields.version !== SAVE_VERSION) {
      const by =
        typeof fields.appVersion === 'string'
          ? `version ${fields.appVersion.slice(0, 40)}`
          : 'another version';
      throw new SaveError(
        `it was made by ${by} of the app, in a format this one can't read`,
        true
      );
    }
    const saved = list(fields.log, 'log', MAX_LOG_ACTIONS);
    if (saved.length === 0) fail('the log is empty');
    const from = savedPlayer(saved[0]);
    const raws = rebase(saved, from, playerId) as unknown[];
    const redo = rebase(fields.redo, from, playerId);
    const first = parseNewGame(raws[0], playerId);
    // The player keeps today's name, not the one they played under.
    const log: GameAction[] = [
      { ...first, players: [{ ...first.players[0], name: playerName }] },
      ...raws.slice(1).map((action) => parseAction(action, playerId)),
    ];
    const replayed = replaySave(log, playerId);
    const settled = settle(replayed.state);
    const floor = integer(fields, 'undoFloor', 1, log.length);
    return {
      state: settled,
      // Settling crossed games, so it can't be undone either.
      undoFloor: settled === replayed.state ? floor : settled.log.length,
      redo:
        settled === replayed.state
          ? list(redo, 'redo', MAX_REDO).map((a) => parsePlayerAction(a))
          : [],
      lines: list(fields.lines, 'lines', MAX_SAVED_LINES).map(parseLine),
      known: replayed.known,
      savedAt: time(fields, 'savedAt'),
      deckName: text(fields, 'deckName'),
    };
  } catch (err) {
    if (err instanceof SaveError) throw err;
    throw new SaveError(err instanceof Error ? err.message : String(err));
  }
};

// Each deck keeps one save; the sample deck one per format it opens in.
export const deckSaveKey = (deckId: number) => `deck-${deckId}`;

export const sampleSaveKey = (format: string) => `sample-${format}`;
