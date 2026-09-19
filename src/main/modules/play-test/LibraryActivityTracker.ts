import {
  describeLibraryActivity,
  type LibraryActivity,
  sameLibraryActivity,
} from '@shared/game';

interface Deps {
  // The activity is part of the public view, so every change is pushed.
  changed(): void;
  log(text: string): void;
}

// The local player's library activity. It isn't game state: nothing is
// undone or replayed, and it's gone whenever its dialog or window is.
export default class LibraryActivityTracker {
  private activity: LibraryActivity | null = null;

  // Reopening the same dialog with nothing logged in between announces
  // nothing new, so cancel-and-reopen can't flood the log.
  private announced: string | null = null;

  constructor(private readonly deps: Deps) {}

  get current(): LibraryActivity | null {
    return this.activity;
  }

  set = (next: LibraryActivity | null) => {
    if (sameLibraryActivity(this.activity, next)) return;
    this.activity = next;
    this.deps.changed();
    if (!next) return;
    const line = describeLibraryActivity(next);
    if (line === this.announced) return;
    this.announced = line;
    this.deps.log(line);
  };

  clear = () => this.set(null);

  // For callers about to push fresh views anyway.
  reset = () => {
    this.activity = null;
  };

  // Called for every line in the log, including this tracker's own.
  lineLogged = (text: string) => {
    if (text !== this.announced) this.announced = null;
  };
}
