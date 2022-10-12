import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class HandStore {
  cards = [
    'e8815cd9-7032-445a-aebc-cfc19bd51ee4',
    '20c9c856-af15-40b1-a799-1c2066df2099',
    'd2e1c1c3-641a-4cd5-b46d-e03e5e529cc7',
  ];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    this.cards.splice(this.cards.indexOf(id), 1);
    window.electron.ipcRenderer.sendMessage('played', id);
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
