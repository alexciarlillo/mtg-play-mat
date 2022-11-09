import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class HandStore {
  cards = [];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    console.log('play', id);
    this.cards.splice(this.cards.indexOf(id), 1);
    window.electron.ipcRenderer.sendMessage('played', id);
  }

  add(id) {
    console.log('add', id);
    this.cards.push(id);
  }
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
