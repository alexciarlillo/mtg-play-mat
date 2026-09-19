import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  type GameMenuCommand,
  gameMenuTemplate,
  runGameMenuCommand,
} from './gameMenu';

const items = (playTestOpen: boolean) => {
  const run = vi.fn();
  const openSettings = vi.fn();
  const menu = gameMenuTemplate({ playTestOpen, run, openSettings });
  const submenu = (menu.submenu as MenuItemConstructorOptions[]).filter(
    (item) => item.type !== 'separator'
  );
  const byId = (id: string) => {
    const item = submenu.find((i) => i.id === id);
    if (!item) throw new Error(`no ${id} item`);
    return item;
  };
  const click = (id: string) => (byId(id).click as () => void | undefined)();
  return { menu, submenu, byId, click, run, openSettings };
};

const gameCommands: GameMenuCommand[] = [
  'draw',
  'drawMany',
  'mill',
  'untapAll',
  'shuffle',
  'token',
  'undo',
  'redo',
  'restart',
  'addDummy',
  'help',
];

describe('gameMenuTemplate', () => {
  it('has one item per command, plus Settings', () => {
    const { submenu } = items(true);
    expect(submenu.map((item) => item.id)).toEqual([
      ...gameCommands.map((command) => `game-${command}`),
      'game-settings',
    ]);
  });

  it('enables the game items only while a play test is open', () => {
    const closed = items(false);
    const open = items(true);
    gameCommands.forEach((command) => {
      expect(closed.byId(`game-${command}`).enabled).toBe(false);
      expect(open.byId(`game-${command}`).enabled).toBe(true);
    });
    expect(closed.byId('game-settings').enabled).not.toBe(false);
  });

  it('never registers an accelerator', () => {
    const { submenu } = items(true);
    submenu.forEach((item) => expect(item.accelerator).toBeUndefined());
  });

  it('runs the command for the clicked item', () => {
    const { click, run, openSettings } = items(true);
    gameCommands.forEach((command) => click(`game-${command}`));
    expect(run.mock.calls.map(([command]) => command)).toEqual(gameCommands);
    click('game-settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

describe('runGameMenuCommand', () => {
  const target = () => ({
    playerId: 'p1',
    dispatch: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    toBoard: vi.fn(),
  });

  it.each([
    ['draw', { type: 'draw', playerId: 'p1', count: 1 }],
    ['untapAll', { type: 'untapAll', playerId: 'p1' }],
    ['shuffle', { type: 'shuffle', playerId: 'p1' }],
  ] as const)('dispatches %s in main', (command, action) => {
    const t = target();
    runGameMenuCommand(command, t);
    expect(t.dispatch).toHaveBeenCalledWith(action);
    expect(t.toBoard).not.toHaveBeenCalled();
  });

  it('undoes and redoes in main', () => {
    const t = target();
    runGameMenuCommand('undo', t);
    runGameMenuCommand('redo', t);
    expect(t.undo).toHaveBeenCalledTimes(1);
    expect(t.redo).toHaveBeenCalledTimes(1);
    expect(t.toBoard).not.toHaveBeenCalled();
  });

  it.each([
    'drawMany',
    'mill',
    'token',
    'restart',
    'help',
    'addDummy',
  ] as const)('sends %s to the board window', (command) => {
    const t = target();
    runGameMenuCommand(command, t);
    expect(t.toBoard).toHaveBeenCalledWith(command);
    expect(t.dispatch).not.toHaveBeenCalled();
  });
});
