// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SaveStore from './SaveStore';

let dir: string;

beforeEach(() => {
  dir = path.join(mkdtempSync(path.join(tmpdir(), 'saves-')), 'saves');
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe('SaveStore', () => {
  it('reads nothing before anything is saved', () => {
    expect(new SaveStore(dir).read('deck-1')).toBeNull();
  });

  it('coalesces a burst into one write of the latest data', () => {
    vi.useFakeTimers();
    const store = new SaveStore(dir);
    store.schedule('deck-1', { n: 1 });
    store.schedule('deck-1', { n: 2 });
    expect(store.read('deck-1')).toBeNull();
    vi.runAllTimers();
    expect(store.read('deck-1')).toEqual({ n: 2 });
    // Only the file itself is left, no temporary one.
    expect(readdirSync(dir)).toEqual(['deck-1.json']);
  });

  it('writes at once on flush, and removes', () => {
    const store = new SaveStore(dir);
    store.schedule('sample-constructed', { n: 1 });
    store.flush();
    expect(store.read('sample-constructed')).toEqual({ n: 1 });
    store.remove('sample-constructed');
    expect(store.read('sample-constructed')).toBeNull();
  });

  it('throws on a file that isn’t JSON', () => {
    const store = new SaveStore(dir);
    store.schedule('deck-2', {});
    store.flush();
    writeFileSync(path.join(dir, 'deck-2.json'), '{"half');
    expect(() => store.read('deck-2')).toThrow();
  });

  it('refuses keys that could leave the folder', () => {
    const store = new SaveStore(dir);
    expect(() => store.read('../x')).toThrow();
  });

  it('survives a write it can’t make', () => {
    const blocked = path.join(path.dirname(dir), 'file');
    writeFileSync(blocked, '');
    const store = new SaveStore(path.join(blocked, 'saves'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.schedule('deck-1', {});
    expect(() => store.flush()).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(existsSync(path.join(blocked, 'saves'))).toBe(false);
  });
});

describe('SaveStore, when things go wrong', () => {
  it('sets an unusable save aside, keeping only the latest', () => {
    const store = new SaveStore(dir);
    store.schedule('deck-1', { n: 1 });
    store.flush();
    expect(store.setAside('deck-1')).toBe(
      path.join(dir, 'deck-1.unreadable.json')
    );
    expect(store.read('deck-1')).toBeNull();
    store.schedule('deck-1', { n: 2 });
    store.flush();
    store.setAside('deck-1');
    expect(readdirSync(dir)).toEqual(['deck-1.unreadable.json']);
    expect(
      JSON.parse(readFileSync(path.join(dir, 'deck-1.unreadable.json'), 'utf8'))
    ).toEqual({ n: 2 });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(store.setAside('deck-9')).toBeNull();
    error.mockRestore();
  });

  it('removes a left-over temporary file with the save', () => {
    const store = new SaveStore(dir);
    store.schedule('deck-1', {});
    store.flush();
    writeFileSync(path.join(dir, 'deck-1.json.tmp'), '{');
    store.remove('deck-1');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('tries a failed write again with the next one', () => {
    const blocked = path.join(path.dirname(dir), 'blocked');
    writeFileSync(blocked, '');
    const store = new SaveStore(path.join(blocked, 'saves'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.schedule('deck-1', { n: 1 });
    store.flush();
    rmSync(blocked);
    mkdirSync(blocked);
    store.flush();
    expect(store.read('deck-1')).toEqual({ n: 1 });
    error.mockRestore();
  });
});
