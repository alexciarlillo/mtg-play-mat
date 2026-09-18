import IpcEvents from '@shared/ipc/IpcEvents';
import { SearchCardsByNameOptions } from '@shared/types/cards';

import BaseModule, { ModuleDeps } from '../../shared/BaseModule';
import CardDB from '../../shared/db/CardDB';

export default class CollectionModule extends BaseModule {
  cardDb: CardDB;

  constructor(deps: ModuleDeps) {
    super({ name: 'Collection', label: 'Collection Test', ...deps });

    this.cardDb = new CardDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.SEARCH_CARDS,
      handle: (searchOptions: SearchCardsByNameOptions) => {
        const cards = this.cardDb.searchCardsByName(searchOptions);

        this.mainWindow?.webContents.send(IpcEvents.SEARCH_RESULTS, cards);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.GET_SETS,
      handle: () => {
        const sets = this.cardDb.getCurrentSetList();

        this.mainWindow?.webContents.send(IpcEvents.GET_SETS, sets);
      },
    });
  }
}
