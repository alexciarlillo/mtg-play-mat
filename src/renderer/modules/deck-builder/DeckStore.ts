import type { DeckSummary } from '@shared/types/decks';
import { makeAutoObservable } from 'mobx';

export default class DeckStore {
  decks: DeckSummary[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  setDecks = (decks: DeckSummary[]) => {
    this.decks = decks;
  };

  refreshDecks() {
    void window.api.listDecks().then(this.setDecks);
  }

  deleteDeck({ id }: { id: number }) {
    void window.api.deleteDeck(id).then(this.setDecks);
  }
}
