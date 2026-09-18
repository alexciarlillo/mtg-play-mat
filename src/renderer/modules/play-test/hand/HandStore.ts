import CardModel from '@shared/models/CardModel';
import { makeAutoObservable } from 'mobx';

import { toCardProps } from '../cardProps';

export default class HandStore {
  cards: CardModel[] = [];

  constructor() {
    makeAutoObservable(this);

    window.api.onDeckLoaded(() => this.reset());
    window.api.onCardDrawn((card) => this.add(new CardModel(card)));
  }

  play = (card: CardModel) => {
    const index = this.cards.findIndex((_card) => _card.id === card.id);
    if (index === -1) return;
    this.cards.splice(index, 1);
    void window.api.playCard(toCardProps(card));
  };

  add = (card: CardModel) => {
    this.cards.push(card);
  };

  reset = () => {
    this.cards = [];
  };
}
