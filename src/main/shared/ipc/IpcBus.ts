import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { ipcMain } from 'electron';

// Payloads are untyped until the IPC layer gets a typed channel map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (arg: any) => void;

interface RegisterHandlerOptions {
  event: IpcEvents;
  handle: Handler;
}

export default class IpcBus {
  mainChannel: IpcChannel;

  eventHandlers: Partial<Record<IpcEvents, Handler[]>>;

  constructor() {
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
    this.eventHandlers = {};

    Object.values(IpcEvents).forEach((ipcEvent) => {
      this.mainChannel.On(ipcEvent, (_event: unknown, arg: unknown) => {
        this.eventHandlers[ipcEvent]?.forEach((handle) => {
          try {
            handle(arg);
          } catch (err) {
            console.error(`[IpcBus] handler for ${ipcEvent} failed`, err);
          }
        });
      });
    });
  }

  registerHandler = ({ event, handle }: RegisterHandlerOptions) => {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(handle);
  };
}
