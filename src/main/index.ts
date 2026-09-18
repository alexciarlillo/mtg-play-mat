import { app, BrowserWindow } from 'electron';

import MenuBuilder from './menu';
import CollectionModule from './modules/collection/CollectionModule';
import DeckBuilderModule from './modules/deck-builder/DeckBuilderModule';
import PlayTestModule from './modules/play-test/PlayTestModule';
import IpcBus from './shared/ipc/IpcBus';
import WindowTypes from './shared/ipc/WindowTypes';
import ModuleManager from './shared/ModuleManager';
import WindowManager from './shared/WindowManager';

let appWindow: BrowserWindow | null = null;

const windowManager = new WindowManager();

const createAppWindow = (playTestModule: PlayTestModule) => {
  appWindow = windowManager.registerWindow({
    type: WindowTypes.APP,
    html: 'app.html',
    width: 1500,
    height: 500,
    onReady: (window) => {
      window.show();
    },
    onClosed: () => {
      appWindow = null;
    },
  });

  const menuBuilder = new MenuBuilder(appWindow, {
    openSamplePlayTest: playTestModule.openSampleDeck,
  });
  menuBuilder.buildMenu();
};

const start = () => {
  const moduleManager = new ModuleManager();
  const ipcBus = new IpcBus();

  const playTestModule = new PlayTestModule({ windowManager, ipcBus });
  moduleManager.registerModule(playTestModule);
  moduleManager.registerModule(
    new DeckBuilderModule({ windowManager, ipcBus })
  );
  moduleManager.registerModule(new CollectionModule({ windowManager, ipcBus }));

  createAppWindow(playTestModule);

  app.on('activate', () => {
    // On macOS the dock icon should bring back a closed app window. Modules
    // and IPC handlers stay registered, so only the window is recreated.
    if (appWindow === null) createAppWindow(playTestModule);
  });
};

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(start).catch(console.error);
