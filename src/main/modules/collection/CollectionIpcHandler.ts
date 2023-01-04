import { ipcMain, ipcRenderer } from 'electron';
import IpcEvents from 'IpcEvents';
import IpcChannel from 'main/shared/ipc/IpcChannel';

export interface SearchOptions {
  title: string;
}

export default class CollectionIpcHandler {
  rendererChannel;

  mainChannel;

  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
  }

  searchCards = (options: SearchOptions) => {
    this.rendererChannel.Send(IpcEvents.SEARCH_CARDS, options);
  };
}
