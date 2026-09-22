import {
  type DebugEntry,
  type DebugEnv,
  type DebugLevel,
  type DebugSink,
  type DebugSnapshot,
  describeError,
  errorSource,
  formatDebugEntry,
  scopedLog,
} from '@shared/debug';

// Enough to cover a whole attempt at joining a game, and still short
// enough to read in one screenshot's worth of scrolling.
export const MAX_DEBUG_ENTRIES = 300;

export interface DebugLogDeps {
  env(): DebugEnv;
  onChange?(): void;
  now?(): number;
  // Mirrored to the terminal as well, so a run from a shell shows it.
  console?: Pick<Console, 'log' | 'warn' | 'error'>;
}

// The one buffer. Every window logs into it over IPC and the Play online
// page renders it, so a player can screenshot the lot and send it on.
export default class DebugLog implements DebugSink {
  private entries: DebugEntry[] = [];

  private nextId = 1;

  constructor(private readonly deps: DebugLogDeps) {}

  record = (level: DebugLevel, scope: string, text: string): void => {
    const at = (this.deps.now ?? Date.now)();
    const last = this.entries[this.entries.length - 1];
    // A repeat only moves its line's time and count, so a busy game
    // cannot push the interesting lines out of the buffer.
    if (
      last &&
      last.level === level &&
      last.scope === scope &&
      last.text === text
    ) {
      this.entries[this.entries.length - 1] = {
        ...last,
        at,
        count: last.count + 1,
      };
      this.deps.onChange?.();
      return;
    }
    const entry: DebugEntry = {
      id: this.nextId,
      at,
      level,
      scope,
      text,
      count: 1,
    };
    this.nextId += 1;
    this.entries.push(entry);
    if (this.entries.length > MAX_DEBUG_ENTRIES) {
      this.entries = this.entries.slice(-MAX_DEBUG_ENTRIES);
    }
    this.mirror(entry);
    this.deps.onChange?.();
  };

  scoped = (scope: string) => scopedLog(this, scope);

  // An exception from anywhere in the app, netplay or not: those are the
  // ones the log is also there to catch.
  caught = (scope: string, what: string, err: unknown): void => {
    this.scoped(scope).error(what, {
      error: describeError(err),
      at: errorSource(err),
    });
  };

  snapshot = (): DebugSnapshot => ({
    env: this.deps.env(),
    entries: [...this.entries],
  });

  clear = (): DebugSnapshot => {
    this.entries = [];
    this.deps.onChange?.();
    return this.snapshot();
  };

  private mirror = (entry: DebugEntry) => {
    const out = this.deps.console ?? console;
    const line = formatDebugEntry(entry);
    if (entry.level === 'error') out.error(line);
    else if (entry.level === 'warn') out.warn(line);
    else out.log(line);
  };
}
