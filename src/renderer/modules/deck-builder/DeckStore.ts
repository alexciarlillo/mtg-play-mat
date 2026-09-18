import IpcEvents from '@shared/ipc/IpcEvents';
import { DeckRow } from '@shared/types/cards';
import { makeAutoObservable } from 'mobx';

export default class DeckStore {
  decks: DeckRow[] = [];

  constructor() {
    makeAutoObservable(this);

    window.DeckBuilder.rendererChannel.On(
      IpcEvents.GET_DECKS,
      (_event: unknown, decks: DeckRow[]) => {
        this.setDecks(decks);
      }
    );
  }

  setDecks(decks: DeckRow[]) {
    this.decks = decks;
  }

  refreshDecks() {
    window.DeckBuilder.getDecks();
  }

  addDeck({ name, deckList }: { name: string; deckList: string }) {
    window.DeckBuilder.import({ name, deckList });
  }

  deleteDeck({ id }: { id: number }) {
    window.DeckBuilder.delete({ id });
  }
}
