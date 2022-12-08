/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import WindowManager from './shared/WindowManager';
import IpcBus from './shared/ipc/IpcBus';
import ModuleManager from './shared/ModuleManager';
import WindowTypes from './shared/ipc/WindowTypes';
import PlayTestModule from './modules/play-test/PlayTestModule';
import DeckBuilderModule from './modules/deck-builder/DeckBuilderModule';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

let startWindow = null;

const start = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const windowManager = new WindowManager();
  const moduleManager = new ModuleManager();
  const ipcBus = new IpcBus();

  moduleManager.registerModule(new PlayTestModule({ windowManager, ipcBus }));
  moduleManager.registerModule(
    new DeckBuilderModule({ windowManager, ipcBus })
  );

  startWindow = windowManager.registerWindow({
    type: WindowTypes.START,
    html: '/app.html',
    onReady: (window) => {
      window.show();
    },
  });

  const menuBuilder = new MenuBuilder(startWindow);
  menuBuilder.buildMenu();

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    start();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (startWindow === null) start();
    });
  })
  .catch(console.log);
