import IpcEvents from 'IpcEvents';
import {
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from 'main/shared/db/CardDB';
// import { SearchCardOptions } from 'main/modules/collection/CollectionModule';
import { action, computed, makeAutoObservable, observable } from 'mobx';

export default class CollectionStore {
  searchResults: Array<SearchCardsByNameRet> = [];

  constructor() {
    makeAutoObservable(this, {
      setSearchResults: action,
      findCard: action,
      searchResults: observable,
    });

    window.Collection.rendererChannel.On(
      IpcEvents.SEARCH_RESULTS,
      (_: IpcEvents, results: SearchCardsByNameRet[]) => {
        this.setSearchResults(results);
      }
    );
  }

  findCard = (options: SearchCardsByNameOptions) => {
    window.Collection.searchCards(options);
  };

  setSearchResults = (results: SearchCardsByNameRet[]) => {
    this.searchResults = results;
  };
}
