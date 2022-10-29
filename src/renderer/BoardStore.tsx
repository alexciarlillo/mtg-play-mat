import React from 'react';
import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield = ['e8815cd9-7032-445a-aebc-cfc19bd51ee4'];
  graveyard = ['c7a7fe6e-aa5a-4be6-a730-5cfff4fb89e3'];
  library = [
    'a808868f-aea8-4651-9357-85a4d7b4f290',
    'cb1d0254-985c-4d44-9cce-1d563e11f0a4',
    'eab611c3-3a24-4033-864f-084b71317320',
  ];

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
    const id = this.library.shift();
    window.electron.ipcRenderer.sendMessage('draw', id);
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
