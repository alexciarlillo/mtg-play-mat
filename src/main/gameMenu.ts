import type { PlayerAction, PlayerId } from '@shared/game';
import type { BoardMenuCommand } from '@shared/types/playTest';
import type { MenuItemConstructorOptions } from 'electron';

export type GameMenuCommand =
  'draw' | 'untapAll' | 'shuffle' | 'undo' | 'redo' | BoardMenuCommand;

export interface GameMenuOptions {
  // Only an open play test has anything for the game items to act on.
  playTestOpen: boolean;
  run(command: GameMenuCommand): void;
  openSettings(): void;
}

// No accelerators: plain letters would swallow typing in text fields, and
// Cmd/Ctrl+Z belongs to Edit > Undo. The board's own hotkeys cover both.
export const gameMenuTemplate = ({
  playTestOpen,
  run,
  openSettings,
}: GameMenuOptions): MenuItemConstructorOptions => {
  const item = (
    id: GameMenuCommand,
    label: string
  ): MenuItemConstructorOptions => ({
    id: `game-${id}`,
    label,
    enabled: playTestOpen,
    click: () => run(id),
  });

  return {
    id: 'game',
    label: 'Game',
    submenu: [
      item('draw', 'Draw a Card'),
      item('drawMany', 'Draw N…'),
      item('mill', 'Mill N…'),
      item('untapAll', 'Untap All'),
      item('shuffle', 'Shuffle Library'),
      item('token', 'Create Token…'),
      { type: 'separator' },
      item('undo', 'Undo Game Action'),
      item('redo', 'Redo Game Action'),
      item('restart', 'Restart Game…'),
      { type: 'separator' },
      item('addDummy', 'Add Placeholder Opponent'),
      item('help', 'Keyboard Shortcuts'),
      { type: 'separator' },
      { id: 'game-settings', label: 'Settings…', click: openSettings },
    ],
  };
};

export interface GameMenuTarget {
  playerId: PlayerId;
  dispatch(action: PlayerAction): void;
  undo(): void;
  redo(): void;
  toBoard(command: BoardMenuCommand): void;
}

// Items with nothing to ask act on the game here; the rest need a dialog
// or a view only the board window has.
export const runGameMenuCommand = (
  command: GameMenuCommand,
  { playerId, dispatch, undo, redo, toBoard }: GameMenuTarget
) => {
  switch (command) {
    case 'draw':
      dispatch({ type: 'draw', playerId, count: 1 });
      break;
    case 'untapAll':
      dispatch({ type: 'untapAll', playerId });
      break;
    case 'shuffle':
      dispatch({ type: 'shuffle', playerId });
      break;
    case 'undo':
      undo();
      break;
    case 'redo':
      redo();
      break;
    default:
      toBoard(command);
  }
};
