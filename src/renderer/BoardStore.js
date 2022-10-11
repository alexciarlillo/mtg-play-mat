import { makeAutoObservable } from 'mobx';

export default class BoardStore {
  battlefield = [];
  graveyard = [];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    this.battlefield.push(id);
  }
}
