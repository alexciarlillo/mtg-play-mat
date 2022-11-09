/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import Database from 'better-sqlite3';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import webpackPaths from '../../.erb/configs/webpack.paths';
import DeckImporter from './DeckImporter';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let handWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const cardDbPath = isDebug
  ? path.join(webpackPaths.appPath, './db/AllPrintings.sqlite')
  : path.join(__dirname, '../../db/AllPrintings.sqlite'); // In prod, __dirname is release/app/dist/main. We want release/app/sql

let database = null;
try {
  database = new Database(cardDbPath, { readonly: true, fileMustExist: true });
} catch (err) {
  console.error('[DB Load Error]', err.message);
}

ipcMain.on('search-query', async (event, arg) => {
  let results = [];
  try {
    const stmt = database.prepare(
      'SELECT name, uuid, scryfallId, originalText FROM cards WHERE name LIKE ?'
    );
    results = stmt.all('%slimefoot%');
  } catch (err) {
    console.error('[DB Statement Error]', err.message);
  }
  event.reply('search-results', results);
});

ipcMain.on('played', async (event, arg) => {
  console.log('played', arg);
  mainWindow.webContents.send('etb', arg);
});

ipcMain.on('draw', async (event, arg) => {
  console.log('draw', arg);
  handWindow.webContents.send('draw', arg);
});

ipcMain.on('import', async (event, arg) => {
  const deckPath = isDebug
    ? path.join(webpackPaths.appPath, './db/slimefoot.txt')
    : path.join(__dirname, '../../db/slimefoot.txt');
  console.log('importing deck', deckPath);
  const importer = new DeckImporter(database);
  const lines = fs.readFileSync(deckPath).toString().split('\n');
  const cards = importer.import(lines);
  mainWindow.webContents.send('newdeck', cards);
});

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

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1560,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('board.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  handWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 330,
    frame: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  handWindow.loadURL(resolveHtmlPath('hand.html'));

  handWindow.on('ready-to-show', () => {
    if (!handWindow) {
      throw new Error('"handWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      handWindow.minimize();
    } else {
      handWindow.show();
    }
  });

  handWindow.on('closed', () => {
    handWindow = null;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
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
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
