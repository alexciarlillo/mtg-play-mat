import path from 'path';
import { app, BrowserWindow } from 'electron';
import { resolveHtmlPath } from '../util';
import WindowTypes from './ipc/WindowTypes';

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

export default class WindowManager {
  constructor(ipcBus) {
    this.windows = {};
  }

  get mainWindow() {
    return this.windows[WindowTypes.APP];
  }

  registerWindow = ({
    type,
    width = 500,
    height = 500,
    html,
    onReady,
    onClosed,
    ...windowProps
  }) => {
    const { windows } = this;

    const window = new BrowserWindow({
      show: false,
      width,
      height,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, '../preload.js')
          : path.join(__dirname, '../../../.erb/dll/preload.js'),
      },
      ...windowProps,
    });

    windows[type] = window;

    windows[type].loadURL(resolveHtmlPath(html));

    windows[type].on('ready-to-show', () => {
      if (!windows[type]) {
        throw new Error(`Window type ${type} is not defined`);
      }

      onReady?.(windows[type]);

      if (process.env.START_MODULE === 'play-test') {
        if (type === WindowTypes.BOARD || type === WindowTypes.HAND) {
          windows[type].show();
        }
      } else if (type === WindowTypes.APP) {
        windows[type].show();
      }
    });

    const windowId = window.id;

    windows[type].on('closed', (arg) => {
      windows[type] = null;
      onClosed?.({ windowId });
    });

    // Open urls in the user's browser
    windows[type].webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });

    return windows[type];
  };

  closeWindow = ({ type }) => {
    windows[type]?.close();
  };
}
