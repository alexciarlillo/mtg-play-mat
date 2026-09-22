import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { isMatId } from '@shared/mat';

import {
  decodeMat,
  displayCopy,
  type MatEncoder,
  MatError,
  MAX_SHARE_BYTES,
  shareCopy,
} from './matEncoding';

// A picture big enough to be worth putting on a table, and no bigger:
// anything past this is a mistake, not a playmat.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export interface MatStoreDeps {
  dir: string;
  encoder: MatEncoder;
}

const hash = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');

const exists = (file: string) =>
  stat(file).then(
    (s) => s.isFile(),
    () => false
  );

// Write then rename, so a crash never leaves half a mat behind.
const writeAtomic = async (file: string, bytes: Buffer) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
};

// Every mat this machine knows: the player's own, and the ones peers
// have sent. A mat is named by the hash of the bytes that travel, so
// both ends of a pod agree on its name and a peer cannot claim someone
// else's mat by naming it.
export default class MatStore {
  constructor(private readonly deps: MatStoreDeps) {}

  // What the board draws: the display copy when this machine made the
  // mat, otherwise the copy that arrived.
  displayPath = async (id: string): Promise<string | null> => {
    if (!isMatId(id)) return null;
    const full = this.path(id, 'full');
    if (await exists(full)) return full;
    return (await exists(this.path(id))) ? this.path(id) : null;
  };

  // Takes the player's chosen file and keeps both copies of it.
  importFile = async (file: string): Promise<string> => {
    const source = await this.read(file);
    const image = decodeMat(this.deps.encoder, source);
    const share = shareCopy(image);
    const id = hash(share);
    await mkdir(this.deps.dir, { recursive: true });
    await writeAtomic(this.path(id), share);
    await writeAtomic(this.path(id, 'full'), displayCopy(image));
    return id;
  };

  // A mat a peer sent. The bytes have to hash to the name they came
  // under, so a peer can only ever add the mat it actually sent.
  receive = async (id: string, bytes: Buffer): Promise<boolean> => {
    if (!isMatId(id) || bytes.length === 0) return false;
    if (bytes.length > MAX_SHARE_BYTES) return false;
    if (hash(bytes) !== id) return false;
    if (await exists(this.path(id))) return true;
    await mkdir(this.deps.dir, { recursive: true });
    await writeAtomic(this.path(id), bytes);
    return true;
  };

  // The bytes to send: only ever the share copy, which is the one the
  // id names.
  shareBytes = async (id: string): Promise<Buffer | null> => {
    if (!isMatId(id)) return null;
    try {
      return await readFile(this.path(id));
    } catch {
      return null;
    }
  };

  // Drops a mat this machine made. A peer's copy is left alone: it is
  // theirs to change, and it costs a few hundred kilobytes.
  forget = async (id: string): Promise<void> => {
    if (!isMatId(id)) return;
    await Promise.all(
      [this.path(id), this.path(id, 'full')].map((file) =>
        unlink(file).catch(() => undefined)
      )
    );
  };

  private path = (id: string, which: 'share' | 'full' = 'share') =>
    path.join(this.deps.dir, which === 'full' ? `${id}.full.jpg` : `${id}.jpg`);

  private read = async (file: string): Promise<Buffer> => {
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new MatError('That file could not be read.');
    if (info.size > MAX_SOURCE_BYTES) {
      throw new MatError('That image is too large. Pick one under 40 MB.');
    }
    return readFile(file);
  };
}
