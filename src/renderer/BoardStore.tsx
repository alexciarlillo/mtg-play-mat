import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield = [];

  graveyard = [];

  library = [];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    this.battlefield.push(id);
  }

  moved(id) {
    this.battlefield.splice(this.battlefield.indexOf(id), 1);
    this.battlefield.push(id);
  }

  drawCard() {
    const { scryfallId } = this.library.shift();
    window.electron.ipcRenderer.sendMessage('draw', scryfallId);
  }

  importDeck = () => {
    window.electron.ipcRenderer.sendMessage('import');
  };

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

  destroy(id) {
    this.graveyard.push(id);
    this.battlefield.splice(this.battlefield.indexOf(id), 1);
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
