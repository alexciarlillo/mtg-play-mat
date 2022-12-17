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
      handle: ({ name, deckList }) => {
        const importer = new DeckImporter({ cardDb: this.cardDb });
        const cards = importer.importFromString({ string: deckList });

        this.deckDb.addDeck({
          name,
          displayCardId: cards[0].uuid,
          cardIds: cards.map((c) => c.uuid),
        });

        this.mainWindow?.send(IpcEvents.GET_DECKS, this.getDecks());
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.GET_DECKS,
      handle: () => {
        this.mainWindow?.send(IpcEvents.GET_DECKS, this.getDecks());
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.DELETE_DECK,
      handle: ({ id }) => {
        this.deckDb.deleteDeck({
          id,
        });

        this.mainWindow?.send(IpcEvents.GET_DECKS, this.getDecks());
      },
    });
  }

  getDecks = () => {
    const decks = this.deckDb.getDecks();
    decks.forEach((deck) => {
      if (deck.display_card_id) {
        const card = this.cardDb.getCardById({ id: deck.display_card_id });
        deck.displayScryfallId = card.scryfallId;
      }
    });

    return decks;
  };
}
