// @vitest-environment node
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuActions } from './menu';

const electron = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: {
    name: 'mtg-play-mat',
    get isPackaged() {
      return electron.isPackaged;
    },
    quit: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
    setApplicationMenu: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  BrowserWindow: vi.fn(),
}));

const window = () =>
  ({
    webContents: { on: vi.fn(), reload: vi.fn(), toggleDevTools: vi.fn() },
    setFullScreen: vi.fn(),
    isFullScreen: () => false,
  }) as unknown as BrowserWindow;

const build = async ({
  packaged = false,
  count = 0,
  enabled = true,
}: { packaged?: boolean; count?: number; enabled?: boolean } = {}) => {
  electron.isPackaged = packaged;
  vi.resetModules();
  const { default: MenuBuilder } = await import('./menu');
  const actions: MenuActions = {
    fakeOpponents: vi.fn(() => count),
    fakeOpponentsEnabled: vi.fn(() => enabled),
    openSamplePlayTest: vi.fn(),
    openSettings: vi.fn(),
    playTestOpen: vi.fn(() => false),
    runGameCommand: vi.fn(),
    setFakeOpponents: vi.fn(),
  };
  const builder = new MenuBuilder(window(), actions);
  const viewOf = (template: MenuItemConstructorOptions[]) => {
    const view = template.find((item) =>
      String(item.label).replace('&', '').startsWith('View')
    );
    return (view?.submenu ?? []) as MenuItemConstructorOptions[];
  };
  const darwin = viewOf(builder.buildDarwinTemplate());
  const other = viewOf(builder.buildDefaultTemplate());
  const fakes = (view: MenuItemConstructorOptions[]) =>
    view.find((item) => item.id === 'fake-opponents');
  return { actions, darwin, other, fakes };
};

describe('fake opponents menu', () => {
  beforeEach(() => {
    electron.isPackaged = false;
  });

  it('offers the submenu in a development build', async () => {
    const { darwin, other, fakes } = await build();
    [darwin, other].forEach((view) => {
      const item = fakes(view);
      expect(item?.label).toBe('Fake Opponents');
      expect(
        (item?.submenu as MenuItemConstructorOptions[]).map((i) => i.label)
      ).toEqual(['None', '1', '2', '3']);
    });
  });

  it('sits next to the sample play test', async () => {
    const { darwin } = await build();
    const labels = darwin.map((item) => item.label);
    expect(labels.indexOf('Fake Opponents')).toBe(
      labels.indexOf('Open Sample Play Test') + 1
    );
  });

  it('is absent from a packaged build', async () => {
    const { darwin, other, fakes } = await build({ packaged: true });
    expect(fakes(darwin)).toBeUndefined();
    expect(fakes(other)).toBeUndefined();
    expect(darwin.map((item) => item.label)).not.toContain(
      'Open Sample Play Test'
    );
  });

  it('checks the count the netplay instance reports', async () => {
    const { darwin, fakes } = await build({ count: 2 });
    const items = fakes(darwin)?.submenu as MenuItemConstructorOptions[];
    expect(items.map((item) => item.checked)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(items.every((item) => item.type === 'radio')).toBe(true);
  });

  it('checks None when no fakes are set', async () => {
    const { darwin, fakes } = await build();
    const items = fakes(darwin)?.submenu as MenuItemConstructorOptions[];
    expect(items.map((item) => item.checked)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('passes the clicked count through', async () => {
    const { actions, darwin, fakes } = await build();
    const items = fakes(darwin)?.submenu as MenuItemConstructorOptions[];
    items.forEach((item) => (item.click as () => void)());
    expect(vi.mocked(actions.setFakeOpponents).mock.calls).toEqual([
      [0],
      [1],
      [2],
      [3],
    ]);
  });

  it('disables the submenu while a session is live', async () => {
    const live = await build({ enabled: false });
    expect(live.fakes(live.darwin)?.enabled).toBe(false);
    const idle = await build();
    expect(idle.fakes(idle.darwin)?.enabled).toBe(true);
  });
});
