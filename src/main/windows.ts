import path from 'node:path';

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import icon from '../../assets/icon.png?asset';
import { isRendererUrl, rendererUrl } from './util';

export interface CreateWindowOptions extends Omit<
  BrowserWindowConstructorOptions,
  'webPreferences'
> {
  html: string;
  // Hidden windows that must react promptly (the net window) opt out.
  backgroundThrottling?: boolean;
}

export const createWindow = ({
  html,
  backgroundThrottling = true,
  ...windowOptions
}: CreateWindowOptions): BrowserWindow => {
  const window = new BrowserWindow({
    show: false,
    icon,
    ...windowOptions,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling,
    },
  });

  // Pages only ever route by hash, so any real navigation or popup is
  // unexpected and would load content outside our CSP.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    if (!isRendererUrl(event.url)) event.preventDefault();
  });

  window.loadURL(rendererUrl(html)).catch((err) => {
    console.error(`[windows] failed to load ${html}`, err);
  });

  return window;
};

// Resolves once the page has run its scripts, so pushed events have a
// listener. Resolves false if the window goes away first.
export const whenLoaded = (window: BrowserWindow): Promise<boolean> => {
  if (window.isDestroyed()) return Promise.resolve(false);
  if (!window.webContents.isLoading()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onLoad = () => {
      window.removeListener('closed', onClosed);
      resolve(true);
    };
    const onClosed = () => resolve(false);
    window.webContents.once('did-finish-load', onLoad);
    window.once('closed', onClosed);
  });
};
