import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

// Far beyond any real game; a bigger file is not one of ours.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const WRITE_DELAY_MS = 400;

// What a play test needs from wherever its saved games live.
export interface Saves {
  // The parsed JSON, or null when there is no save. Throws when the
  // file exists but can't be read as JSON.
  read(key: string): unknown;
  // Writes soon, coalescing a burst of changes into one write.
  schedule(key: string, data: unknown): void;
  // Writes anything scheduled now.
  flush(): void;
  remove(key: string): void;
  // Moves a save that can't be used out of the way, so the new game
  // doesn't write over it; returns where it went, or null.
  setAside(key: string): string | null;
}

// One JSON file per deck under the saves directory. Each write goes to a
// temporary file first and is renamed over the old one, so a crash mid
// write leaves the previous save whole.
export default class SaveStore implements Saves {
  private readonly dir: string;

  private readonly pending = new Map<string, unknown>();

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(dir: string) {
    this.dir = dir;
  }

  private file = (key: string) => {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`bad save key ${key}`);
    return path.join(this.dir, `${key}.json`);
  };

  read = (key: string): unknown => {
    const file = this.file(key);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return null;
    }
    if (size > MAX_FILE_BYTES) throw new Error('the file is too large');
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  };

  schedule = (key: string, data: unknown) => {
    this.pending.set(key, data);
    this.timer ??= setTimeout(this.flush, WRITE_DELAY_MS);
  };

  flush = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const writes = [...this.pending];
    this.pending.clear();
    writes.forEach(([key, data]) => this.write(key, data));
  };

  remove = (key: string) => {
    this.pending.delete(key);
    const file = this.file(key);
    try {
      rmSync(file, { force: true });
      rmSync(`${file}.tmp`, { force: true });
    } catch (err) {
      console.error('[saves] could not remove a save', err);
    }
  };

  // Only the latest unusable save is kept.
  setAside = (key: string): string | null => {
    const file = this.file(key);
    const aside = path.join(this.dir, `${key}.unreadable.json`);
    try {
      renameSync(file, aside);
      return aside;
    } catch (err) {
      console.error('[saves] could not set a save aside', err);
      return null;
    }
  };

  // A failed write must never take the game down with it; it is tried
  // again with the next write, unless newer data replaced it by then.
  private write = (key: string, data: unknown) => {
    const file = this.file(key);
    const temp = `${file}.tmp`;
    const json = JSON.stringify(data);
    // Never written, since read would refuse it.
    if (Buffer.byteLength(json) > MAX_FILE_BYTES) {
      console.error('[saves] the game is too large to save');
      return;
    }
    try {
      mkdirSync(this.dir, { recursive: true });
      // Synced before the rename, so a power cut can't leave the new
      // name pointing at data that never reached the disk.
      const fd = openSync(temp, 'w');
      try {
        writeSync(fd, json);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, file);
    } catch (err) {
      console.error('[saves] could not save the game', err);
      try {
        rmSync(temp, { force: true });
      } catch {
        // The folder itself may be what's missing.
      }
      if (!this.pending.has(key)) this.pending.set(key, data);
    }
  };
}
