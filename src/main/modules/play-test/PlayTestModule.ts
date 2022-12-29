import IpcEvents from 'IpcEvents';
import CardDB from '../../shared/db/CardDB';
import DeckDB from '../../shared/db/DeckDB';
import BaseModule from '../../shared/BaseModule';
import WindowTypes from '../../shared/ipc/WindowTypes';
import CardModel from '../../../shared/models/CardModel';

export default class PlayTestModule extends BaseModule {
  constructor({ ...rest }) {
    super({ name: 'PlayTest', label: 'Play Test', ...rest });

    this.cardDb = new CardDB();
    this.deckDb = new DeckDB();

    this.boardWindow = this.registerModuleWindow({
      type: WindowTypes.BOARD,
      width: 1560,
      height: 728,
      html: 'board.html',
      onClosed: () => {
        this.boardWindow = null;
        this.handWindow?.close();
      },
    });

    this.handWindow = this.registerModuleWindow({
      type: WindowTypes.HAND,
      width: 1200,
      height: 330,
      html: 'hand.html',
      frame: false,
      onClosed: () => {
        this.handWindow = null;
        this.boardWindow?.close();
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.PLAY,
      handle: (arg) => {
        this.boardWindow?.send(IpcEvents.ETB, arg);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.DRAW,
      handle: (arg) => {
        this.handWindow?.send(IpcEvents.DRAW, arg);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.PLAY_TEST,
      handle: (deckId) => {
        const cards = this.deckDb
          .getDeckCards({ deckId })
          .map((card, index) => {
            const _card = this.cardDb.getCardById({ id: card.card_id });
            _card.keywords =
              _card.keywords
                ?.split(',')
                .map((keyword) => keyword.toLowerCase()) || [];
            _card.id = _card.uuid;
            _card.key = index;
            return new CardModel(_card);
          });

        this.handWindow.show();
        this.boardWindow.show();
        this.boardWindow?.send(IpcEvents.DECK_LOADED, cards);
      },
    });
  }

  open = () => {};

  close = () => {};
}
