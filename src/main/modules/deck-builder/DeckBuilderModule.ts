import DeckImporter from 'DeckImporter';
import IpcEvents from 'IpcEvents';
import CardDB from '../../shared/db/CardDB';
import DeckDB from '../../shared/db/DeckDB';
import BaseModule from '../../shared/BaseModule';

export default class DeckBuilderModule extends BaseModule {
  constructor({ ...rest }) {
    super({ name: 'DeckBuilder', label: 'Deck Builder', ...rest });

    this.cardDb = new CardDB();
    this.deckDb = new DeckDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.IMPORT,
      handle: (deckList) => {
        const importer = new DeckImporter({ cardDb: this.cardDb });
        const cards = importer.importFromString({ string: deckList });

        this.deckDb.addDeck({
          name: 'slimefoot',
          displayCardId: 'f599550d-28ba-53ae-b725-20489667ad9d',
          cardIds: cards.map((c) => c.uuid),
        });
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.GET_DECKS,
      handle: () => {
        const decks = this.deckDb.getDecks();
        decks.forEach((deck) => {
          if (deck.display_card_id) {
            const card = this.cardDb.getCardById({ id: deck.display_card_id });
            deck.displayScryfallId = card.scryfallId;
          }
        });

        this.mainWindow?.send(IpcEvents.GET_DECKS, decks);
      },
    });
  }
}
