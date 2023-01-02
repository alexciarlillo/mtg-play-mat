import { ipcMain, ipcRenderer } from 'electron';
import IpcEvents from 'IpcEvents';
import IpcChannel from 'main/shared/ipc/IpcChannel';

export default class DeckBuilderIpcHandler {
  rendererChannel: any;
  mainChannel: any;
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
  }

  import = (arg) => {
    this.rendererChannel.Send(IpcEvents.IMPORT, arg);
  };

  delete = (arg) => {
    this.rendererChannel.Send(IpcEvents.DELETE_DECK, arg);
  };

  getDecks = () => {
    this.rendererChannel.Send(IpcEvents.GET_DECKS);
  };
}
