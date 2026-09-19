import type { ElectronApplication, Page } from '@playwright/test';

// Clicks an item of the application's Game menu, as a user would, and
// reports whether it was enabled. Disabled items are not clicked.
export const clickGameMenu = (app: ElectronApplication, command: string) =>
  app.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(`game-${id}`);
    if (!item) throw new Error(`no game-${id} menu item`);
    if (!item.enabled) return false;
    item.click();
    return true;
  }, command);

export const gameMenuEnabled = (app: ElectronApplication, command: string) =>
  app.evaluate(
    ({ Menu }, id) =>
      Menu.getApplicationMenu()?.getMenuItemById(`game-${id}`)?.enabled ?? null,
    command
  );

// The battlefield's own menu. Cards can sit anywhere on the field, so
// right-click the margin just left of it, which never holds a card.
export const battlefieldMenuItem = async (board: Page, name: string) => {
  const box = await board.getByTestId('battlefield').boundingBox();
  if (!box) throw new Error('no battlefield');
  await board.mouse.click(box.x - 8, box.y + 8, { button: 'right' });
  return board.getByRole('menuitem', { name, exact: true });
};
