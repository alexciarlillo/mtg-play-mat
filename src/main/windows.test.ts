// @vitest-environment node
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));
vi.mock('../../assets/icon.png?asset', () => ({ default: 'icon.png' }));

const fakeWindow = () => {
  const calls: string[] = [];
  const window = {
    show: vi.fn(() => calls.push('show')),
    showInactive: vi.fn(() => calls.push('showInactive')),
    focus: vi.fn(() => calls.push('focus')),
  } as unknown as BrowserWindow;
  return { window, calls };
};

// The flag is read once, when the module loads, so each case loads a
// fresh copy under the environment it wants.
const load = async (testHooks: boolean) => {
  vi.resetModules();
  vi.stubEnv('MTG_PLAY_MAT_TEST_HOOKS', testHooks ? '1' : '');
  return import('./windows');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('showWindow and focusWindow', () => {
  it('shows and focuses a window normally', async () => {
    const { showWindow } = await load(false);
    const { window, calls } = fakeWindow();
    showWindow(window, true);
    expect(calls).toEqual(['show', 'focus']);
  });

  it('shows without focusing unless asked', async () => {
    const { showWindow } = await load(false);
    const { window, calls } = fakeWindow();
    showWindow(window);
    expect(calls).toEqual(['show']);
  });

  it('focuses a window normally', async () => {
    const { focusWindow } = await load(false);
    const { window, calls } = fakeWindow();
    focusWindow(window);
    expect(calls).toEqual(['focus']);
  });

  it('only ever shows inactive under test hooks', async () => {
    const { showWindow } = await load(true);
    const { window, calls } = fakeWindow();
    showWindow(window, true);
    showWindow(window);
    expect(calls).toEqual(['showInactive', 'showInactive']);
  });

  it('never focuses under test hooks', async () => {
    const { focusWindow } = await load(true);
    const { window, calls } = fakeWindow();
    focusWindow(window);
    expect(calls).toEqual([]);
  });
});
