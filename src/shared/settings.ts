import { isMatId } from './mat';

// App-wide preferences, persisted by main and pushed to every window.
// Each field pairs its default with a parser, so a new setting is one
// entry here; a bad or missing value falls back to the default.

export const DEFAULT_DISPLAY_NAME = 'Player';
export const MAX_DISPLAY_NAME_LENGTH = 32;

type Parse<T> = (input: unknown) => T | undefined;

interface Field<T> {
  default: T;
  parse: Parse<T>;
}

const field = <T>(defaultValue: T, parse: Parse<T>): Field<T> => ({
  default: defaultValue,
  parse,
});

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input);

const boolean: Parse<boolean> = (input) =>
  typeof input === 'boolean' ? input : undefined;

export const cleanDisplayName = (input: unknown): string => {
  if (typeof input !== 'string') return DEFAULT_DISPLAY_NAME;
  // Control characters would only garble the opponent's board.
  const name = input
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return name || DEFAULT_DISPLAY_NAME;
};

const displayName: Parse<string> = (input) =>
  typeof input === 'string' ? cleanDisplayName(input) : undefined;

export const MAX_RELAY_URL_LENGTH = 200;
export const MAX_RELAY_KEY_LENGTH = 128;

// Where lobby codes are brokered. Blank means lobby codes are off and
// only peer-to-peer invites work.
const relayUrl: Parse<string> = (input) => {
  if (typeof input !== 'string') return undefined;
  const text = input.trim().slice(0, MAX_RELAY_URL_LENGTH);
  if (text === '') return '';
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? text
      : undefined;
  } catch {
    return undefined;
  }
};

const relayKey: Parse<string> = (input) =>
  typeof input === 'string'
    ? input.replace(/\s+/g, '').slice(0, MAX_RELAY_KEY_LENGTH)
    : undefined;

// Where a floating panel sits, as a fraction of the room it can move in
// (0 is the left or top edge, 1 the right or bottom), so it keeps its
// corner when the window is resized.
export interface PanelPlacement {
  x: number;
  y: number;
  collapsed: boolean;
}

const fraction = (input: unknown): number | undefined =>
  typeof input === 'number' && Number.isFinite(input)
    ? Math.min(1, Math.max(0, input))
    : undefined;

const panelPlacement: Parse<PanelPlacement> = (input) => {
  if (!isRecord(input)) return undefined;
  const x = fraction(input.x);
  const y = fraction(input.y);
  const collapsed = boolean(input.collapsed);
  if (x === undefined || y === undefined || collapsed === undefined) {
    return undefined;
  }
  return { x, y, collapsed };
};

// The hand tray docked along the bottom of the board, in single-window
// mode. The height is in px; the board keeps it within the window.
export interface TrayPlacement {
  height: number;
  collapsed: boolean;
}

export const MIN_TRAY_HEIGHT = 120;
export const MAX_TRAY_HEIGHT = 1200;

const trayPlacement: Parse<TrayPlacement> = (input) => {
  if (!isRecord(input)) return undefined;
  const { height } = input;
  const collapsed = boolean(input.collapsed);
  if (typeof height !== 'number' || !Number.isFinite(height)) return undefined;
  if (collapsed === undefined) return undefined;
  return {
    height: Math.round(
      Math.min(MAX_TRAY_HEIGHT, Math.max(MIN_TRAY_HEIGHT, height))
    ),
    collapsed,
  };
};

// The opponents' row along the top of the board, in px. The player
// drags it to the height they want; the board keeps it within the
// window, so a height saved on a large screen still fits a small one.
export const MIN_OPPONENT_ROW_HEIGHT = 120;
export const MAX_OPPONENT_ROW_HEIGHT = 1200;
export const DEFAULT_OPPONENT_ROW_HEIGHT = 320;

const opponentRowHeight: Parse<number> = (input) =>
  typeof input === 'number' && Number.isFinite(input)
    ? Math.round(
        Math.min(
          MAX_OPPONENT_ROW_HEIGHT,
          Math.max(MIN_OPPONENT_ROW_HEIGHT, input)
        )
      )
    : undefined;

// A mat is named by the hash of its bytes; anything else never came
// from the store.
const matId: Parse<string> = (input) =>
  input === '' || isMatId(input) ? (input as string) : undefined;

const fields = {
  displayName: field(DEFAULT_DISPLAY_NAME, displayName),
  // Turn and phase tracking clutters the board, so it is opt-in.
  turnTracking: field(false, boolean),
  // The board's dice and log panel starts in the field's bottom-right.
  tablePanel: field<PanelPlacement>(
    { x: 1, y: 1, collapsed: false },
    panelPlacement
  ),
  // One window instead of a separate hand window: the default, since a
  // single window is the simpler table. It applies when a play test
  // opens, and anyone watching the board also sees the hand.
  handInBoard: field(true, boolean),
  handTray: field<TrayPlacement>(
    { height: 280, collapsed: false },
    trayPlacement
  ),
  opponentRow: field(DEFAULT_OPPONENT_ROW_HEIGHT, opponentRowHeight),
  // The player's own play area background, by the id the mat store
  // names it with; blank for the bare table.
  matImage: field('', matId),
  // Each opponent's own log, under their seat. One preference for every
  // seat, so folding it away is a single click in a pod.
  seatLog: field(true, boolean),
  // The relay server that hands out lobby codes, and the key this copy
  // of the app presents to it. Both blank by default: you point the app
  // at your own relay.
  relayUrl: field('', relayUrl),
  relayKey: field('', relayKey),
};

type Fields = typeof fields;

export type Settings = {
  [K in keyof Fields]: Fields[K] extends Field<infer T> ? T : never;
};

export type SettingsPatch = Partial<Settings>;

const keys = Object.keys(fields) as (keyof Settings)[];

export const defaultSettings = Object.fromEntries(
  keys.map((key) => [key, fields[key].default])
) as Settings;

// Only known keys with valid values survive; everything else is dropped.
export const parseSettingsPatch = (input: unknown): SettingsPatch => {
  if (!isRecord(input)) return {};
  const patch: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (!(key in input)) return;
    const value = fields[key].parse(input[key]);
    if (value !== undefined) patch[key] = value;
  });
  return patch as SettingsPatch;
};

// Reads a saved file of any age: an old one with only a display name
// gets defaults for everything added since.
export const parseSettings = (input: unknown): Settings => ({
  ...defaultSettings,
  ...parseSettingsPatch(input),
});
