import IpcEvents from '@shared/ipc/IpcEvents';
import CardModel, { CardModelProps } from '@shared/models/CardModel';
import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield: CardModel[] = [];

  graveyard: CardModel[] = [];

  library: CardModel[] = [];

  constructor() {
    makeAutoObservable(this);

    window.Board.rendererChannel.On(
      IpcEvents.ETB,
      (_event: unknown, cardJson: string) => {
        const card = new CardModel(JSON.parse(cardJson) as CardModelProps);
        this.play(card);
      }
    );

    window.Board.rendererChannel.On(
      IpcEvents.DECK_LOADED,
      (_event: unknown, cards: CardModelProps[]) => {
        this.reset(cards.map((card) => new CardModel(card)));
      }
    );
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
      window.Board.draw(JSON.stringify(card));
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
