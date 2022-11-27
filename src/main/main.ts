/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import webpackPaths from '../../.erb/configs/webpack.paths';
import CardDB from './db/CardDB';
import IpcBus from './ipc/IpcBus';
import WindowTypes from './ipc/WindowTypes';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

const windows = {
  [WindowTypes.START]: null,
  [WindowTypes.BOARD]: null,
  [WindowTypes.HAND]: null,
};

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const cardDb = new CardDB();
const ipcBus = new IpcBus();

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

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

const initWindow = ({
  type,
  width = 500,
  height = 500,
  html,
  ...windowProps
}) => {
  windows[type] = new BrowserWindow({
    show: false,
    width,
    height,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
    ...windowProps,
  });

  ipcBus.registerWindow({ type, window: windows[type] });
  windows[type].loadURL(resolveHtmlPath(html));

  windows[type].on('ready-to-show', () => {
    if (!windows[type]) {
      throw new Error(`Window type ${type} is not defined`);
    }

    if (process.env.START_MODULE === 'play-test') {
      if (type === WindowTypes.BOARD || type === WindowTypes.HAND) {
        windows[type].show();
      }
    } else if (type === WindowTypes.START) {
      windows[type].show();
    }
  });

  windows[type].on('closed', () => {
    windows[type] = null;
  });
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  initWindow({ type: WindowTypes.START, html: 'start.html' });
  initWindow({
    type: WindowTypes.BOARD,
    width: 1560,
    height: 728,
    html: 'board.html',
  });
  initWindow({
    type: WindowTypes.HAND,
    width: 1200,
    height: 330,
    html: 'hand.html',
    frame: false,
  });

  const menuBuilder = new MenuBuilder(windows[WindowTypes.START]);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  Object.values(windows).forEach((window) => {
    if (window) {
      window.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
      });
    }
  });

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
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (windows[start] === null) createWindow();
    });
  })
  .catch(console.log);
