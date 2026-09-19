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

const fields = {
  displayName: field(DEFAULT_DISPLAY_NAME, displayName),
  // Turn and phase tracking clutters the board, so it is opt-in.
  turnTracking: field(false, boolean),
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

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input);

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
