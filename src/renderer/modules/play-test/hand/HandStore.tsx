import CardModel from 'CardModel';
import React from 'react';
import { makeAutoObservable } from 'mobx';
import IpcEvents from 'IpcEvents';

export default class HandStore {
  cards = [];

  constructor() {
    makeAutoObservable(this);

    window.Hand.rendererChannel.On(IpcEvents.DRAW, (event, cardString) => {
      const card = new CardModel(JSON.parse(cardString));
      this.add(card);
    });
  }

  play = (card) => {
    this.cards.splice(
      this.cards.findIndex((_card) => _card.id === card.id),
      1
    );
    window.Hand.play(JSON.stringify(card));
  };

  add = (card) => {
    this.cards.push(card);
  };
}

const HandStoreContext = React.createContext();

export const HandStoreProvider = ({ children, store }) => {
  return (
    <HandStoreContext.Provider value={store}>
      {children}
    </HandStoreContext.Provider>
  );
};

export const useHandStore = () => React.useContext(HandStoreContext);

export const withHandStore = (Component) => (props) => {
  return <Component {...props} store={useStore()} />;
};
