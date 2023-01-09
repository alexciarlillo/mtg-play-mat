import CardDB from 'main/shared/db/CardDB';
import WindowManager from 'main/shared/WindowManager';
import IpcEvents from 'shared/ipc/IpcEvents';

import BaseModule from '../../shared/BaseModule';

export interface SearchCardOptions {
  keyword: string;
}

interface CollectionModuleOptions {
  windowManager: WindowManager;
  ipcBus: any; //needs type
}

export default class CollectionModule extends BaseModule {
  cardDb;

  constructor({ ...rest }: CollectionModuleOptions) {
    super({ name: 'Collection', label: 'Collection Test', ...rest });

    this.cardDb = new CardDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.SEARCH_CARDS,
      handle: (searchOptions: SearchCardOptions) => {
        const cards = this.cardDb.searchCardsByName(searchOptions);

        this.mainWindow?.send(IpcEvents.SEARCH_RESULTS, cards);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.GET_SETS,
      handle: () => {
        const sets = this.cardDb.getCurrentSetList();

        this.mainWindow?.send(IpcEvents.GET_SETS, sets);
      },
    });
  }
}
