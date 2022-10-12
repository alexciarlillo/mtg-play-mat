import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield = [];
  graveyard = [];

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
