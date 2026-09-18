import {
  type EventChannel,
  type EventPayload,
  type RequestArgs,
  type RequestChannel,
  type RequestResult,
  requestChannels,
} from '@shared/ipc/contract';
import {
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';

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

// Channels that only one particular window may call.
export type SenderGuards = Partial<
  Record<RequestChannel, (sender: WebContents) => boolean>
>;

// Only contract channels get a handler, so invokes on any other channel
// are rejected by Electron and never reach app code.
export const registerRequestHandlers = (
  handlers: RequestHandlers,
  guards: SenderGuards = {}
) => {
  requestChannels.forEach((channel) => {
    const handler = handlers[channel] as (...args: unknown[]) => unknown;
    const guard = guards[channel];

    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event) || (guard && !guard(event.sender))) {
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
