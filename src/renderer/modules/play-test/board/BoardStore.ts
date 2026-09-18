import CardModel from '@shared/models/CardModel';
import { makeAutoObservable } from 'mobx';

import { toCardProps } from '../cardProps';

export default class BoardStore {
  battlefield: CardModel[] = [];

  graveyard: CardModel[] = [];

  library: CardModel[] = [];

  constructor() {
    makeAutoObservable(this);

    window.api.onDeckLoaded((cards) => {
      this.reset(cards.map((card) => new CardModel(card)));
    });
    window.api.onCardPlayed((card) => this.play(new CardModel(card)));
  }

  play(card: CardModel) {
    this.battlefield.push(card);
  }

  moved(card: CardModel) {
    const index = this.battlefield.findIndex((_card) => _card.id === card.id);
    if (index === -1) return;
    this.battlefield.splice(index, 1);
    this.battlefield.push(card);
  }

  drawCard() {
    const card = this.library.shift();
    if (card) {
      void window.api.drawCard(toCardProps(card));
    }
  }

  reset(deck: CardModel[]) {
    this.battlefield = [];
    this.graveyard = [];
    this.library = deck;
    this.shuffle();
  }

  shuffle() {
    this.library = this.library
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  }

  destroy(card: CardModel) {
    const index = this.battlefield.findIndex((_card) => _card.id === card.id);
    if (index === -1) return;
    this.battlefield.splice(index, 1);
    this.graveyard.push(card);
  }
}
