import IpcEvents from 'IpcEvents';
// import { SearchCardOptions } from 'main/modules/collection/CollectionModule';
import { action, makeAutoObservable, observable } from 'mobx';
import React from 'react';

export default class CollectionStore {
  searchResults = [];

  constructor() {
    makeAutoObservable(this, {
      searchResults: observable,
      setSearchResults: action,
    });

    window.Collection.rendererChannel.On(
      IpcEvents.SEARCH_RESULTS,
      (event, results) => {
        this.setSearchResults(results);
      }
    );
  }

  // eslint-disable-next-line class-methods-use-this
  findCard(options) {
    window.Collection.searchCards(options);
  }

  setSearchResults(results) {
    this.searchResults = results;
  }
}

const CollectionStoreContext = React.createContext(CollectionStore);

export const CollectionStoreProvider = ({ children, store }) => {
  return (
    <CollectionStoreContext.Provider value={store}>
      {children}
    </CollectionStoreContext.Provider>
  );
};

export const useCollectionStore = () =>
  React.useContext(CollectionStoreContext);
