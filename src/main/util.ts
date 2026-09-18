import path from 'node:path';

import { BrowserWindow } from 'electron';

// electron-vite serves renderer entries over HTTP in dev (for HMR) and
// emits them as files next to the main bundle in production.
export const loadHtml = (window: BrowserWindow, htmlFileName: string) => {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    return window.loadURL(`${devServerUrl}/${htmlFileName}`);
  }

  return window.loadFile(path.join(__dirname, '../renderer', htmlFileName));
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};
