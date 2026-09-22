// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { MatEncoder, MatImage } from './matEncoding';
import MatStore from './MatStore';

const dirs: string[] = [];

afterEach(() => {
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

// Encodes to a buffer that says what it was: enough to tell the display
// copy from the share copy on disk.
const image = (width: number, height: number): MatImage => ({
  isEmpty: () => false,
  getSize: () => ({ width, height }),
  resize: ({ width: next }) => image(next, height),
  crop: (rect) => image(rect.width, rect.height),
  toJPEG: (quality) => Buffer.from(`jpeg ${width}x${height} q${quality}`),
});

const encoder: MatEncoder = { createFromBuffer: () => image(1600, 900) };

const setup = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtg-mats-'));
  dirs.push(dir);
  const source = path.join(dir, 'source.png');
  writeFileSync(source, 'not really a png, the encoder is fake');
  return { dir, source, mats: new MatStore({ dir, encoder }) };
};

const sha256 = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

describe('MatStore', () => {
  it('names a mat by the bytes that travel, and keeps a sharper copy', async () => {
    const t = setup();
    const id = await t.mats.importFile(t.source);

    const share = await t.mats.shareBytes(id);
    expect(id).toBe(sha256(share as Buffer));
    expect(share?.toString()).toBe('jpeg 1600x900 q82');
    // The board draws the display copy, not the one that travels.
    const shown = await t.mats.displayPath(id);
    expect(readFileSync(shown as string, 'utf8')).toBe('jpeg 1600x900 q88');
  });

  it('refuses a file that is not there, and a directory', async () => {
    const t = setup();
    await expect(
      t.mats.importFile(path.join(t.dir, 'nope.png'))
    ).rejects.toThrow(/could not be read/);
    await expect(t.mats.importFile(t.dir)).rejects.toThrow(/could not be read/);
  });

  it('takes a peer mat only when the bytes hash to the name it came under', async () => {
    const t = setup();
    const bytes = Buffer.from('a peer mat');
    const id = sha256(bytes);

    expect(await t.mats.receive('nonsense', bytes)).toBe(false);
    expect(await t.mats.receive(sha256('something else'), bytes)).toBe(false);
    expect(await t.mats.receive(id, Buffer.alloc(0))).toBe(false);
    expect(await t.mats.displayPath(id)).toBeNull();

    expect(await t.mats.receive(id, bytes)).toBe(true);
    expect(readFileSync((await t.mats.displayPath(id)) as string)).toEqual(
      bytes
    );
    // Hearing it again costs nothing and changes nothing.
    expect(await t.mats.receive(id, bytes)).toBe(true);
  });

  it('refuses a peer mat too big to have come through a message', async () => {
    const t = setup();
    const bytes = Buffer.alloc(181 * 1024, 7);
    expect(await t.mats.receive(sha256(bytes), bytes)).toBe(false);
  });

  it('forgets both copies of its own mat, and shrugs at an unknown one', async () => {
    const t = setup();
    const id = await t.mats.importFile(t.source);
    await t.mats.forget(id);
    expect(await t.mats.displayPath(id)).toBeNull();
    expect(await t.mats.shareBytes(id)).toBeNull();
    await expect(t.mats.forget(sha256('never seen'))).resolves.toBeUndefined();
  });
});
