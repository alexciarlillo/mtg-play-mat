import {
  type Api,
  eventChannels,
  eventListenerName,
  requestChannels,
} from '@shared/ipc/contract';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Build window.api from the contract so the renderer only gets named
// functions, never ipcRenderer or its event objects.
const api: Record<string, unknown> = {};

requestChannels.forEach((channel) => {
  api[channel] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
});

eventChannels.forEach((channel) => {
  api[eventListenerName(channel)] = (listener: (payload: unknown) => void) => {
    const forward = (_event: IpcRendererEvent, payload: unknown) => {
      listener(payload);
    };
    ipcRenderer.on(channel, forward);
    return () => {
      ipcRenderer.removeListener(channel, forward);
    };
  };
});

contextBridge.exposeInMainWorld('api', api as Api);
