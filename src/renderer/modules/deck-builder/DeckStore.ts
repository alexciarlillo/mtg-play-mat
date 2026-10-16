import type { DeckSummary } from '@shared/types/decks';
import { makeAutoObservable } from 'mobx';

export type DeckFilter = 'all' | 'local' | 'moxfield';

export default class DeckStore {
  decks: DeckSummary[] = [];

  // Kept here so it survives a visit to a deck and back.
  filter: DeckFilter = 'all';

  constructor() {
    makeAutoObservable(this);
  }

  get shownDecks(): DeckSummary[] {
    if (this.filter === 'all') return this.decks;
    const synced = this.filter === 'moxfield';
    return this.decks.filter((d) => (d.moxfield !== null) === synced);
  }

  setFilter = (filter: DeckFilter) => {
    this.filter = filter;
  };

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
