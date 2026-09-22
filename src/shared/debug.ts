// The debug log: a short, shareable trace of what multiplayer did, plus
// any exception the app hit. Main owns the buffer; every window feeds it
// and the Play online page renders it.

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export const MAX_DEBUG_TEXT = 300;
export const MAX_DEBUG_SCOPE = 16;

export interface DebugEntry {
  // Rises with every entry, so the page can key on it.
  id: number;
  at: number;
  level: DebugLevel;
  scope: string;
  text: string;
  // How many times this same line ran in a row; a game repeats a line
  // like "out public" constantly, and collapsing keeps the buffer
  // readable.
  count: number;
}

// The context a screenshot needs to be worth anything: which build, on
// what, pointed at which relay. The relay key is never part of it.
export interface DebugEnv {
  appVersion: string;
  platform: string;
  relayHost: string | null;
  relayKeySet: boolean;
}

export interface DebugSnapshot {
  env: DebugEnv;
  entries: DebugEntry[];
}

export const emptyDebugEnv: DebugEnv = {
  appVersion: '',
  platform: '',
  relayHost: null,
  relayKeySet: false,
};

export const emptyDebugSnapshot: DebugSnapshot = {
  env: emptyDebugEnv,
  entries: [],
};

// Whatever a call site wants to say beyond the message itself. Undefined
// values are dropped, so a caller can pass an optional field as it is.
export type DebugFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface DebugSink {
  record(level: DebugLevel, scope: string, text: string): void;
}

export interface ScopedLog {
  debug(text: string, fields?: DebugFields): void;
  info(text: string, fields?: DebugFields): void;
  warn(text: string, fields?: DebugFields): void;
  error(text: string, fields?: DebugFields): void;
}

const value = (input: unknown): string => {
  if (typeof input !== 'string') return String(input);
  return /[\s=]/.test(input) ? JSON.stringify(input) : input;
};

// "message key=value key=value", which reads well in a screenshot and
// still greps.
export const formatDebugText = (text: string, fields?: DebugFields): string => {
  const parts = Object.entries(fields ?? {})
    .filter(([, field]) => field !== undefined)
    .map(([key, field]) => `${key}=${value(field)}`);
  return [text, ...parts].join(' ').slice(0, MAX_DEBUG_TEXT);
};

// A log that throws nothing away but says nothing either: the default
// wherever a sink is optional, such as in tests.
export const nullLog: ScopedLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const scopedLog = (
  sink: DebugSink | undefined,
  scope: string
): ScopedLog => {
  if (!sink) return nullLog;
  const at = (level: DebugLevel) => (text: string, fields?: DebugFields) => {
    sink.record(level, scope, formatDebugText(text, fields));
  };
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
  };
};

export const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    return err.name === 'Error' ? err.message : `${err.name}: ${err.message}`;
  }
  return String(err);
};

// The first frame of a stack, which is usually the only part of it worth
// reading in a screenshot.
export const errorSource = (err: unknown): string | undefined => {
  if (!(err instanceof Error) || typeof err.stack !== 'string')
    return undefined;
  const frame = err.stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at '));
  return frame?.slice(3);
};

// A URL with its secrets taken out: the relay carries the app key and a
// host token in its query, and those must never reach a screenshot.
export const redactUrl = (input: string): string => {
  try {
    const url = new URL(input);
    ['key', 'token'].forEach((name) => {
      if (url.searchParams.has(name)) url.searchParams.set(name, '…');
    });
    return url.toString();
  } catch {
    return '(not a URL)';
  }
};

export const relayHost = (input: string): string | null => {
  try {
    return new URL(input).host;
  } catch {
    return input.trim() === '' ? null : '(not a URL)';
  }
};

const pad = (input: number, width = 2) => String(input).padStart(width, '0');

export const formatDebugTime = (at: number): string => {
  const time = new Date(at);
  return (
    `${pad(time.getHours())}:${pad(time.getMinutes())}:` +
    `${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`
  );
};

export const formatDebugEntry = (entry: DebugEntry): string =>
  `${formatDebugTime(entry.at)} ${entry.level.toUpperCase().padEnd(5)} ` +
  `${entry.scope.padEnd(8)} ${entry.text}` +
  (entry.count > 1 ? ` ×${entry.count}` : '');

export const formatDebugEnv = (env: DebugEnv): string =>
  `MTG Play Mat ${env.appVersion || '?'} · ${env.platform || '?'} · relay ` +
  `${env.relayHost ?? 'not set'}${env.relayKeySet ? ' (key set)' : ' (no key)'}`;

// What the Copy button puts on the clipboard.
export const formatDebugReport = (snapshot: DebugSnapshot): string =>
  [
    formatDebugEnv(snapshot.env),
    ...snapshot.entries.map(formatDebugEntry),
  ].join('\n');

const levels: DebugLevel[] = ['debug', 'info', 'warn', 'error'];

export interface DebugInput {
  level: DebugLevel;
  scope: string;
  text: string;
}

// A window's own log lines still cross IPC, so keep only well-formed
// ones, the way net reports are treated.
export const parseDebugInput = (input: unknown): DebugInput | null => {
  if (typeof input !== 'object' || input === null) return null;
  const fields = input as Record<string, unknown>;
  const { level, scope, text } = fields;
  if (!levels.includes(level as DebugLevel)) return null;
  if (typeof scope !== 'string' || typeof text !== 'string') return null;
  return {
    level: level as DebugLevel,
    scope: scope.slice(0, MAX_DEBUG_SCOPE),
    text: text.slice(0, MAX_DEBUG_TEXT),
  };
};
