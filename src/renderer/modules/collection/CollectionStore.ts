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
  }

  getSets = () => {
    void window.api.listSets().then(this.setSets);
  };

  findCard = (options: SearchCardsByNameOptions) => {
    void window.api.searchCards(options).then(this.setSearchResults);
  };

  setSearchResults = (results: SearchCardsByNameRet[]) => {
    this.searchResults = results;
  };

  setSets = (sets: CurrentSetListReturn[]) => {
    this.sets = sets;
  };
}
