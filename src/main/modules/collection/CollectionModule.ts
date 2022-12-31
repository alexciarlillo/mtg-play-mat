import CardDB from 'main/shared/db/CardDB';
import IpcEvents from 'shared/ipc/IpcEvents';

import BaseModule from '../../shared/BaseModule';

export interface SearchCardOptions {
  keyword: string;
}

export default class CollectionModule extends BaseModule {
  cardDb;

  constructor({ ...rest }) {
    super({ name: 'Collection', label: 'Collection Test', ...rest });

    this.cardDb = new CardDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.SEARCH_CARDS,
      handle: (searchOptions: SearchCardOptions) => {
        console.log('am i here?', searchOptions);
        const cards = this.cardDb.searchCardsByName({
          keyword: searchOptions.keyword,
        });

        console.log('cards', cards);

        this.mainWindow?.send(IpcEvents.SEARCH_RESULTS, cards);
      },
    });
  }
}
