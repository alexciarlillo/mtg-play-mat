import { ipcMain, ipcRenderer } from 'electron';
import IpcEvents from 'IpcEvents';
import { SearchCardsByNameOptions } from 'main/shared/db/CardDB';
import IpcChannel from 'main/shared/ipc/IpcChannel';

export default class CollectionIpcHandler {
  rendererChannel;

  mainChannel;

  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
  }

  searchCards = (options: SearchCardsByNameOptions) => {
    this.rendererChannel.Send(IpcEvents.SEARCH_CARDS, options);
  };
}
