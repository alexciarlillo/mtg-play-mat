import { IpcMain, IpcRenderer } from 'electron';

interface ConstructorOptions {
  ipc: IpcMain | IpcRenderer;
}

export default class IpcChannel {
  ipc;

  constructor({ ipc }: ConstructorOptions) {
    this.ipc = ipc;
  }

  Send = (event, data, ...args) => {
    this.ipc.send(event, data, ...args);
  };

  On = (event, handler) => {
    return this.ipc.on(event, handler);
  };

  Once = (event, handler) => {
    this.ipc.once(event, handler);
  };
}
