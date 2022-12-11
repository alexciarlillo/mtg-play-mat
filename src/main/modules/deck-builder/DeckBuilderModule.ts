import DeckImporter from 'DeckImporter';
import IpcEvents from 'IpcEvents';
import CardDB from '../../shared/db/CardDB';
import BaseModule from '../../shared/BaseModule';

export default class DeckBuilderModule extends BaseModule {
  constructor({ ...rest }) {
    super({ name: 'DeckBuilder', label: 'Deck Builder', ...rest });

    this.cardDb = new CardDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.IMPORT,
      handle: (deckList) => {
        const importer = new DeckImporter({ cardDb: this.cardDb });
        const cards = importer.importFromString({ string: deckList });

        console.log(cards);
      },
    });
  }
}
