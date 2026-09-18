import IpcEvents from '@shared/ipc/IpcEvents';
import { DeckRow } from '@shared/types/cards';

import BaseModule, { ModuleDeps } from '../../shared/BaseModule';
import CardDB from '../../shared/db/CardDB';
import DeckDB from '../../shared/db/DeckDB';
import DeckImporter from '../../shared/DeckImporter';

interface ImportArgs {
  name: string;
  deckList: string;
}

export default class DeckBuilderModule extends BaseModule {
  cardDb: CardDB;

  deckDb: DeckDB;

  constructor(deps: ModuleDeps) {
    super({ name: 'DeckBuilder', label: 'Deck Builder', ...deps });

    this.cardDb = new CardDB();
    this.deckDb = new DeckDB();

    this.ipcBus.registerHandler({
      event: IpcEvents.IMPORT,
      handle: ({ name, deckList }: ImportArgs) => {
        const importer = new DeckImporter({ cardDb: this.cardDb });
        const cards = importer.importFromString({ string: deckList });

        if (cards.length > 0) {
          this.deckDb.addDeck({
            name,
            displayCardId: cards[0].uuid,
            cardIds: cards.map((c) => c.uuid),
          });
        } else {
          console.warn('[DeckBuilder] no cards resolved; deck not saved');
        }

        this.sendDecks();
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.GET_DECKS,
      handle: () => {
        this.sendDecks();
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.DELETE_DECK,
      handle: ({ id }: { id: number }) => {
        this.deckDb.deleteDeck({
          id,
        });

        this.sendDecks();
      },
    });
  }

  sendDecks = () => {
    this.mainWindow?.webContents.send(IpcEvents.GET_DECKS, this.getDecks());
  };

  getDecks = (): DeckRow[] => {
    const decks = this.deckDb.getDecks();
    decks.forEach((deck) => {
      if (deck.display_card_id) {
        const card = this.cardDb.getCardById({ id: deck.display_card_id });
        deck.displayScryfallId = card?.scryfallId;
      }
    });

    return decks;
  };
}
