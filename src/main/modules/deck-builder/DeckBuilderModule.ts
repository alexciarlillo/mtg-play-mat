import IpcEvents from 'IpcEvents';
import CardDB from '../../shared/db/CardDB';
import BaseModule from '../../shared/BaseModule';
import WindowTypes from '../../shared/ipc/WindowTypes';

export default class DeckBuilderModule extends BaseModule {
  constructor({ ...rest }) {
    super({ name: 'DeckBuilder', label: 'Deck Builder', ...rest });

    this.cardDb = new CardDB();
  }

  open = () => {};

  close = () => {};
}
