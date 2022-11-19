import React from 'react';
import { makeAutoObservable } from 'mobx';
import IpcEvents from '../shared/ipc/IpcEvents';

export default class HandStore {
  cards = [];

  constructor() {
    makeAutoObservable(this);

    window.Hand.rendererChannel.On(IpcEvents.DRAW, (event, id) => {
      this.add(id);
    });
  }

  play = (id) => {
    this.cards.splice(this.cards.indexOf(id), 1);
    window.Hand.play({ id });
  };

  add = (id) => {
    this.cards.push(id);
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
