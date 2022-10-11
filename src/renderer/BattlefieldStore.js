import { makeAutoObservable } from 'mobx';

export default class BattlefieldStore {
  battlefield = [];
  graveyard = [];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    this.battlefield.push(id);
  }
}
