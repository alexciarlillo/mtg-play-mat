import type { IpcMain, IpcRenderer } from 'electron';

interface ConstructorOptions {
  ipc: IpcMain | IpcRenderer;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (event: any, ...args: any[]) => void;

export default class IpcChannel {
  ipc: IpcMain | IpcRenderer;

  constructor({ ipc }: ConstructorOptions) {
    this.ipc = ipc;
  }

  Send = (event: string, ...args: unknown[]) => {
    (this.ipc as IpcRenderer).send(event, ...args);
  };

  On = (event: string, handler: Listener) => {
    this.ipc.on(event, handler);
  };

  Once = (event: string, handler: Listener) => {
    this.ipc.once(event, handler);
  };
}
