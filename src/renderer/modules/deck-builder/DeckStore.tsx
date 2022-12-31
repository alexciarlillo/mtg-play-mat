import IpcEvents from 'IpcEvents';
import { action, makeAutoObservable, observable } from 'mobx';
import React from 'react';

export default class DeckStore {
  decks = [];

  constructor() {
    makeAutoObservable(this, { decks: observable, setDecks: action });

    window.DeckBuilder.rendererChannel.On(
      IpcEvents.GET_DECKS,
      (event, decks) => {
        this.setDecks(decks);
      }
    );
  }

  setDecks(decks) {
    this.decks = decks;
  }

  refreshDecks() {
    window.DeckBuilder.getDecks();
  }

  addDeck({ name, deckList }) {
    window.DeckBuilder.import({ name, deckList });
  }

  deleteDeck({ id }) {
    window.DeckBuilder.delete({ id });
  }
}

const DeckStoreContext = React.createContext();

export const DeckStoreProvider = ({ children, store }) => {
  return (
    <DeckStoreContext.Provider value={store}>
      {children}
    </DeckStoreContext.Provider>
  );
};

export const useDeckStore = () => React.useContext(DeckStoreContext);

export const withDeckStore = (Component) => (props) => {
  return <Component {...props} store={useStore()} />;
};
