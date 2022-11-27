import React from 'react';
import { makeAutoObservable } from 'mobx';
import ContextMenu from 'ContextMenu';

export default class ContextMenuStore {
  isOpen = false;

  specs = [];

  posX = 0;

  posY = 0;

  constructor() {
    makeAutoObservable(this);
  }

  open({ specs, x, y }) {
    this.isOpen = true;
    this.specs = specs;
    this.posX = x;
    this.posY = y;
  }

  close() {
    this.isOpen = false;
    this.specs = [];
  }
}

const ContextMenuContext = React.createContext();

export const ContextMenuProvider = ({ children }) => {
  const store = new ContextMenuStore();
  return (
    <ContextMenuContext.Provider value={store}>
      {children}
      <ContextMenu />
    </ContextMenuContext.Provider>
  );
};

export const useContextMenu = () => React.useContext(ContextMenuContext);
