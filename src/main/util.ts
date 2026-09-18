import path from 'node:path';
import { pathToFileURL } from 'node:url';

// electron-vite serves renderer entries over HTTP in dev (for HMR) and
// emits them as files next to the main bundle in production.
const rendererBaseUrl = (): string => {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) return `${devServerUrl.replace(/\/$/, '')}/`;

  return `${pathToFileURL(path.join(__dirname, '../renderer')).href}/`;
};

export const rendererUrl = (htmlFileName: string): string =>
  new URL(htmlFileName, rendererBaseUrl()).href;

export const isRendererUrl = (url: string): boolean =>
  url.startsWith(rendererBaseUrl());

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};
