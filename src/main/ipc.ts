import {
  type EventChannel,
  type EventPayload,
  type RequestArgs,
  type RequestChannel,
  type RequestResult,
  requestChannels,
} from '@shared/ipc/contract';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { isRendererUrl } from './util';

export type RequestHandlers = {
  [C in RequestChannel]: (
    ...args: RequestArgs<C>
  ) => RequestResult<C> | Promise<RequestResult<C>>;
};

const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
  const url = event.senderFrame?.url;
  return url !== undefined && isRendererUrl(url);
};

// Only contract channels get a handler, so invokes on any other channel
// are rejected by Electron and never reach app code.
export const registerRequestHandlers = (handlers: RequestHandlers) => {
  requestChannels.forEach((channel) => {
    const handler = handlers[channel] as (...args: unknown[]) => unknown;

    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) {
        throw new Error(`[ipc] rejected ${channel} from untrusted sender`);
      }
      return handler(...args);
    });
  });
};

export const sendEvent = <C extends EventChannel>(
  window: BrowserWindow | null,
  channel: C,
  payload: EventPayload<C>
) => {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
};
