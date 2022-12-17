import { ipcRenderer, ipcMain } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class DeckBuilderIpcHandler {
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
