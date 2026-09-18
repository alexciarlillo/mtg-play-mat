import path from 'node:path';

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

import icon from '../../../assets/icon.png?asset';
import { loadHtml } from '../util';
import WindowTypes from './ipc/WindowTypes';

export interface RegisterModuleWindowOptions extends BrowserWindowConstructorOptions {
  type: WindowTypes;
  width: number;
  height: number;
  html: string;
  onReady?(_window: BrowserWindow): void;
  onClosed?(options: WindowOnClosedOptions): void;
}

export interface WindowOnClosedOptions {
  windowId: number;
}

type WindowsByType = Partial<Record<WindowTypes, BrowserWindow>>;

export default class WindowManager {
  windows: WindowsByType;

  constructor() {
    this.windows = {};
  }

  get mainWindow() {
    return this.windows[WindowTypes.APP];
  }

  getWindow = (type: WindowTypes) => this.windows[type];

  registerWindow = ({
    type,
    width = 500,
    height = 500,
    html,
    onReady,
    onClosed,
    ...windowProps
  }: RegisterModuleWindowOptions) => {
    const { windows } = this;

    const window = new BrowserWindow({
      show: false,
      width,
      height,
      icon,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
      },
      ...windowProps,
    });

    windows[type] = window;

    loadHtml(window, html).catch((err) => {
      console.error(`[WindowManager] failed to load ${html}`, err);
    });

    window.on('ready-to-show', () => {
      onReady?.(window);

      if (process.env.START_MODULE === 'play-test') {
        if (type === WindowTypes.BOARD || type === WindowTypes.HAND) {
          window.show();
        }
      } else if (type === WindowTypes.APP) {
        window.show();
      }
    });

    const windowId = window.id;

    window.on('closed', () => {
      if (windows[type] === window) {
        delete windows[type];
      }
      onClosed?.({ windowId });
    });

    // Open urls in the user's browser
    window.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    return window;
  };

  closeWindow = ({ type }: { type: WindowTypes }) => {
    this.windows[type]?.close();
  };
}
