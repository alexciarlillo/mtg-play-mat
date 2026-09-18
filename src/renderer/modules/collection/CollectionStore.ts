import IpcEvents from '@shared/ipc/IpcEvents';
import {
  CurrentSetListReturn,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from '@shared/types/cards';
import { makeAutoObservable } from 'mobx';

export default class CollectionStore {
  searchResults: Array<SearchCardsByNameRet> = [];

  sets: Array<CurrentSetListReturn> = [];

  constructor() {
    makeAutoObservable(this);

    window.Collection.rendererChannel.On(
      IpcEvents.SEARCH_RESULTS,
      (_: unknown, results: SearchCardsByNameRet[]) => {
        this.setSearchResults(results);
      }
    );

    window.Collection.rendererChannel.On(
      IpcEvents.GET_SETS,
      (_: unknown, sets: CurrentSetListReturn[]) => {
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
