import { ipcMain, ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

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
    console.log('options', options);
    this.rendererChannel.Send<SearchOptions>(IpcEvents.SEARCH_CARDS, options);
    // this.mainChannel.Send<SearchOptions>(IpcEvents.SEARCH_CARDS, options);
  };
}
