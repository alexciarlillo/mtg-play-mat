// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatError } from '../../mats/matEncoding';
import type MatStore from '../../mats/MatStore';
import SettingsStore from '../settings/SettingsStore';
import createMatHandlers from './matHandlers';

const dirs: string[] = [];

afterEach(() => {
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const ID = 'a'.repeat(64);
const OLD = 'b'.repeat(64);

const setup = (
  { file = '/pictures/mat.png' as string | null, id = ID } = {},
  importFile = vi.fn(async () => id)
) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtg-mat-handlers-'));
  dirs.push(dir);
  const settings = new SettingsStore(path.join(dir, 'settings.json'));
  const forget = vi.fn(async () => undefined);
  const mats = { importFile, forget } as unknown as MatStore;
  const openExternal = vi.fn(async () => undefined);
  const pickFile = vi.fn(async () => file);
  const handlers = createMatHandlers({
    mats,
    settings,
    pickFile,
    openExternal,
  });
  return { handlers, settings, importFile, forget, openExternal, pickFile };
};

describe('mat handlers', () => {
  it('remembers the chosen mat, and drops the one it replaced', async () => {
    const t = setup();
    t.settings.update({ matImage: OLD });

    expect(await t.handlers.chooseMatImage()).toEqual({ id: ID, error: null });
    expect(t.importFile).toHaveBeenCalledWith('/pictures/mat.png', 'mat');
    expect(t.settings.settings.matImage).toBe(ID);
    expect(t.forget).toHaveBeenCalledWith(OLD);
  });

  it('does nothing at all when the player closes the dialog', async () => {
    const t = setup({ file: null });
    t.settings.update({ matImage: OLD });

    expect(await t.handlers.chooseMatImage()).toEqual({
      id: null,
      error: null,
    });
    expect(t.settings.settings.matImage).toBe(OLD);
    expect(t.forget).not.toHaveBeenCalled();
  });

  it('keeps the old mat and says why when the new one cannot be used', async () => {
    const t = setup(
      {},
      vi.fn(async () => {
        throw new MatError('That image is too large. Pick one under 40 MB.');
      })
    );
    t.settings.update({ matImage: OLD });

    expect(await t.handlers.chooseMatImage()).toEqual({
      id: null,
      error: 'That image is too large. Pick one under 40 MB.',
    });
    expect(t.settings.settings.matImage).toBe(OLD);
    expect(t.forget).not.toHaveBeenCalled();
  });

  it('says something plain when the failure is not about the file', async () => {
    const t = setup(
      {},
      vi.fn(async () => {
        throw new Error('EBUSY: resource busy or locked');
      })
    );
    const choice = await t.handlers.chooseMatImage();
    expect(choice.error).toBe(
      'That image could not be used. Try another file.'
    );
  });

  it('goes back to bare table and forgets the file', async () => {
    const t = setup();
    t.settings.update({ matImage: OLD });

    await t.handlers.clearMatImage();
    expect(t.settings.settings.matImage).toBe('');
    expect(t.forget).toHaveBeenCalledWith(OLD);
  });

  it('keeps a card back the same way, in its own setting', async () => {
    const t = setup();
    t.settings.update({ cardBack: OLD });

    expect(await t.handlers.chooseCardBack()).toEqual({ id: ID, error: null });
    expect(t.pickFile).toHaveBeenCalledWith('back');
    expect(t.importFile).toHaveBeenCalledWith('/pictures/mat.png', 'back');
    expect(t.settings.settings.cardBack).toBe(ID);
    expect(t.settings.settings.matImage).toBe('');
    expect(t.forget).toHaveBeenCalledWith(OLD);

    await t.handlers.clearCardBack();
    expect(t.settings.settings.cardBack).toBe('');
    expect(t.forget).toHaveBeenLastCalledWith(ID);
  });

  it('never forgets a picture the other setting still uses', async () => {
    const t = setup();
    t.settings.update({ matImage: OLD, cardBack: OLD });
    await t.handlers.clearCardBack();
    expect(t.settings.settings.cardBack).toBe('');
    expect(t.forget).not.toHaveBeenCalled();
  });

  it('opens the card back gallery in the browser', async () => {
    const t = setup();
    await t.handlers.openCardBackGallery();
    expect(t.openExternal).toHaveBeenCalledWith('https://mpcfill.com/explore');
  });
});
