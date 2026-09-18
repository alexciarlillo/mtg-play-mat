import IpcEvents from '@shared/ipc/IpcEvents';
import CardModel, { CardModelProps } from '@shared/models/CardModel';
import { makeAutoObservable } from 'mobx';

export default class HandStore {
  cards: CardModel[] = [];

  constructor() {
    makeAutoObservable(this);

    window.Hand.rendererChannel.On(
      IpcEvents.DRAW,
      (_event: unknown, cardJson: string) => {
        const card = new CardModel(JSON.parse(cardJson) as CardModelProps);
        this.add(card);
      }
    );
  }

  play = (card: CardModel) => {
    const index = this.cards.findIndex((_card) => _card.id === card.id);
    if (index === -1) return;
    this.cards.splice(index, 1);
    window.Hand.play(JSON.stringify(card));
  };

  add = (card: CardModel) => {
    this.cards.push(card);
  };
}
