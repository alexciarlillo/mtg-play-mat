import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { ipcRenderer } from 'electron';

export default class DeckBuilderIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });

  import = (arg: { name: string; deckList: string }) => {
    this.rendererChannel.Send(IpcEvents.IMPORT, arg);
  };

  delete = (arg: { id: number }) => {
    this.rendererChannel.Send(IpcEvents.DELETE_DECK, arg);
  };

  getDecks = () => {
    this.rendererChannel.Send(IpcEvents.GET_DECKS);
  };
}
