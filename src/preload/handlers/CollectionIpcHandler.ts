import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { SearchCardsByNameOptions } from '@shared/types/cards';
import { ipcRenderer } from 'electron';

export default class CollectionIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });

  searchCards = (options: SearchCardsByNameOptions) => {
    this.rendererChannel.Send(IpcEvents.SEARCH_CARDS, options);
  };

  getSets = () => {
    this.rendererChannel.Send(IpcEvents.GET_SETS, undefined);
  };
}
