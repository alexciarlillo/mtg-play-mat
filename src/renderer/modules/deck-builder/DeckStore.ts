import { DeckRow } from '@shared/types/cards';
import { makeAutoObservable } from 'mobx';

export default class DeckStore {
  decks: DeckRow[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  setDecks = (decks: DeckRow[]) => {
    this.decks = decks;
  };

  refreshDecks() {
    void window.api.listDecks().then(this.setDecks);
  }

  addDeck({ name, deckList }: { name: string; deckList: string }) {
    void window.api.importDeck({ name, deckList }).then(this.setDecks);
  }

  deleteDeck({ id }: { id: number }) {
    void window.api.deleteDeck(id).then(this.setDecks);
  }
}
