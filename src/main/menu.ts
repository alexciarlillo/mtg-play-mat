import {
  app,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';

import { type GameMenuCommand, gameMenuTemplate } from './gameMenu';

interface DarwinMenuItemConstructorOptions extends MenuItemConstructorOptions {
  selector?: string;
  submenu?: DarwinMenuItemConstructorOptions[] | Menu;
}

export interface MenuActions {
  openSamplePlayTest(): void;
  openSettings(): void;
  playTestOpen(): boolean;
  runGameCommand(command: GameMenuCommand): void;
}

const isDebug = !app.isPackaged || process.env.DEBUG_PROD === 'true';

const repoUrl = 'https://github.com/alexciarlillo/mtg-play-mat';

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  actions: MenuActions;

  constructor(mainWindow: BrowserWindow, actions: MenuActions) {
    this.mainWindow = mainWindow;
    this.actions = actions;
  }

  buildMenu(): Menu {
    if (isDebug) {
      this.setupDevelopmentEnvironment();
    }
    return this.refresh();
  }

  // Rebuilds the menu so items follow app state (the Game menu is enabled
  // only while a play test is open).
  refresh(): Menu {
    const template =
      process.platform === 'darwin'
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  setupDevelopmentEnvironment(): void {
    this.mainWindow.webContents.on('context-menu', (_, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            this.mainWindow.webContents.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });
    });
  }

  buildDarwinTemplate(): MenuItemConstructorOptions[] {
    const subMenuAbout: DarwinMenuItemConstructorOptions = {
      label: app.name,
      submenu: [
        {
          label: `About ${app.name}`,
          selector: 'orderFrontStandardAboutPanel:',
        },
        { type: 'separator' },
        this.settingsItem('Command+,'),
        { type: 'separator' },
        { label: 'Services', submenu: [] },
        { type: 'separator' },
        {
          label: `Hide ${app.name}`,
          accelerator: 'Command+H',
          selector: 'hide:',
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:',
        },
        { label: 'Show All', selector: 'unhideAllApplications:' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit: DarwinMenuItemConstructorOptions = {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'Command+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+Command+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Command+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'Command+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'Command+V', selector: 'paste:' },
        {
          label: 'Select All',
          accelerator: 'Command+A',
          selector: 'selectAll:',
        },
      ],
    };
    const subMenuViewDev: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: () => {
            this.mainWindow.webContents.reload();
          },
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+I',
          click: () => {
            this.mainWindow.webContents.toggleDevTools();
          },
        },
        { type: 'separator' },
        this.samplePlayTestItem(),
      ],
    };
    const subMenuViewProd: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
      ],
    };
    const subMenuWindow: DarwinMenuItemConstructorOptions = {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          selector: 'performMiniaturize:',
        },
        { label: 'Close', accelerator: 'Command+W', selector: 'performClose:' },
        { type: 'separator' },
        { label: 'Bring All to Front', selector: 'arrangeInFront:' },
      ],
    };
    const subMenuHelp: MenuItemConstructorOptions = {
      label: 'Help',
      submenu: [this.projectPageItem()],
    };

    const subMenuView = isDebug ? subMenuViewDev : subMenuViewProd;

    return [
      subMenuAbout,
      subMenuEdit,
      subMenuView,
      this.gameMenu(),
      subMenuWindow,
      subMenuHelp,
    ];
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const templateDefault: MenuItemConstructorOptions[] = [
      {
        label: '&File',
        submenu: [
          {
            label: '&Open',
            accelerator: 'Ctrl+O',
          },
          {
            label: '&Close',
            accelerator: 'Ctrl+W',
            click: () => {
              this.mainWindow.close();
            },
          },
          { type: 'separator' },
          this.settingsItem('Ctrl+,'),
        ],
      },
      {
        label: '&View',
        submenu: isDebug
          ? [
              {
                label: '&Reload',
                accelerator: 'Ctrl+R',
                click: () => {
                  this.mainWindow.webContents.reload();
                },
              },
              {
                label: 'Toggle &Full Screen',
                accelerator: 'F11',
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                },
              },
              {
                label: 'Toggle &Developer Tools',
                accelerator: 'Alt+Ctrl+I',
                click: () => {
                  this.mainWindow.webContents.toggleDevTools();
                },
              },
              { type: 'separator' },
              this.samplePlayTestItem(),
            ]
          : [
              {
                label: 'Toggle &Full Screen',
                accelerator: 'F11',
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                },
              },
            ],
      },
      this.gameMenu(),
      {
        label: 'Help',
        submenu: [this.projectPageItem()],
      },
    ];

    return templateDefault;
  }

  // With no card database there are no decks, so development builds offer
  // a fixture deck to exercise the board and hand windows.
  samplePlayTestItem(): MenuItemConstructorOptions {
    return {
      label: 'Open Sample Play Test',
      accelerator: 'CmdOrCtrl+Shift+P',
      click: () => {
        this.actions.openSamplePlayTest();
      },
    };
  }

  gameMenu(): MenuItemConstructorOptions {
    return gameMenuTemplate({
      playTestOpen: this.actions.playTestOpen(),
      run: (command) => this.actions.runGameCommand(command),
      openSettings: () => this.actions.openSettings(),
    });
  }

  settingsItem(accelerator: string): MenuItemConstructorOptions {
    return {
      label: 'Settings…',
      accelerator,
      click: () => this.actions.openSettings(),
    };
  }

  projectPageItem(): MenuItemConstructorOptions {
    return {
      label: 'Project Page',
      click() {
        shell.openExternal(repoUrl);
      },
    };
  }
}
