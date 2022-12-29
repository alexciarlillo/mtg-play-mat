import CardModel from 'CardModel';
import React from 'react';
import { makeAutoObservable } from 'mobx';
import IpcEvents from 'IpcEvents';

export default class BoardStore {
  battlefield = [];

  graveyard = [];

  library = [];

  constructor() {
    makeAutoObservable(this);

    window.Board.rendererChannel.On(IpcEvents.ETB, (event, _card) => {
      const card = new CardModel(JSON.parse(_card));
      this.play(card);
    });

    window.Board.rendererChannel.On(IpcEvents.DECK_LOADED, (event, cards) => {
      this.reset(cards);
    });
  }

  play(card) {
    this.battlefield.push(card);
  }

  moved(card) {
    this.battlefield.splice(
      this.battlefield.findIndex((_card) => _card.id === card.id),
      1
    );
    this.battlefield.push(card);
  }

  drawCard() {
    const card = this.library.shift();
    window.Board.draw(JSON.stringify(card));
  }

  reset(deck) {
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

  destroy(card) {
    console.log('destroy', card);
    this.graveyard.push(card);
    this.battlefield.splice(
      this.battlefield.findIndex((_card) => _card.id === card.id),
      1
    );
  }
}

const BoardStoreContext = React.createContext();

export const BoardStoreProvider = ({ children, store }) => {
  return (
    <BoardStoreContext.Provider value={store}>
      {children}
    </BoardStoreContext.Provider>
  );
};

export const useBoardStore = () => React.useContext(BoardStoreContext);

export const withBoardStore = (Component) => (props) => {
  return <Component {...props} store={useStore()} />;
};
