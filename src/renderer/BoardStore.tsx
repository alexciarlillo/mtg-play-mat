import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield = ['e8815cd9-7032-445a-aebc-cfc19bd51ee4'];
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
