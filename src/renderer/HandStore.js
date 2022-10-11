import { makeAutoObservable } from 'mobx';

export default class HandStore {
  hand = [
    'e8815cd9-7032-445a-aebc-cfc19bd51ee4',
    '20c9c856-af15-40b1-a799-1c2066df2099',
    'd2e1c1c3-641a-4cd5-b46d-e03e5e529cc7',
  ];

  constructor() {
    makeAutoObservable(this);
  }

  play(id) {
    this.hand.splice(this.hand.indexOf(id), 1);
    window.electron.ipcRenderer.sendMessage('played', id);
  }
}
