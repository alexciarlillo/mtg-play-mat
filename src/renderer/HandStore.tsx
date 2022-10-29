import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class HandStore {
  cards = [
    '20c9c856-af15-40b1-a799-1c2066df2099',
    'd2e1c1c3-641a-4cd5-b46d-e03e5e529cc7',
    '7abd2723-2851-4f1a-b2d0-dfcb526472c3',
    '6b088a25-e837-44a7-835c-a9899f852f92',
    '004e232c-ea3d-4a8c-bf16-234ac09e4567',
    '465d8c18-c76b-488a-a4ec-ec0d2267a307',
    '7ee18815-21af-4cc4-bb2c-9ec60d0c30da',
  ];

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
