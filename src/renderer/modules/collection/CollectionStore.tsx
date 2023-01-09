import IpcEvents from 'IpcEvents';
import {
  CurrentSetListReturn,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from 'main/shared/db/CardDB.d';
// import { SearchCardOptions } from 'main/modules/collection/CollectionModule';
import { action, computed, makeAutoObservable, observable } from 'mobx';

export default class CollectionStore {
  searchResults: Array<SearchCardsByNameRet> = [];

  sets: Array<CurrentSetListReturn> = [];

  constructor() {
    makeAutoObservable(this, {
      searchResults: observable,
      sets: observable,
      setSearchResults: action,
      findCard: action,
      setSets: action,
    });

    window.Collection.rendererChannel.On(
      IpcEvents.SEARCH_RESULTS,
      (_: IpcEvents, results: SearchCardsByNameRet[]) => {
        this.setSearchResults(results);
      }
    );

    window.Collection.rendererChannel.On(
      IpcEvents.GET_SETS,
      (_: IpcEvents, sets: CurrentSetListReturn[]) => {
        this.setSets(sets);
      }
    );
  }

  getSets = () => {
    window.Collection.getSets();
  };

  findCard = (options: SearchCardsByNameOptions) => {
    window.Collection.searchCards(options);
  };

  setSearchResults = (results: SearchCardsByNameRet[]) => {
    this.searchResults = results;
  };

  setSets = (sets: CurrentSetListReturn[]) => {
    this.sets = sets;
  };
}
