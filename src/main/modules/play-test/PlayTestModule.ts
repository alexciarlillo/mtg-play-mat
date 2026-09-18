import IpcEvents from '@shared/ipc/IpcEvents';
import CardModel from '@shared/models/CardModel';
import { BrowserWindow } from 'electron';

import BaseModule, { ModuleDeps } from '../../shared/BaseModule';
import CardDB from '../../shared/db/CardDB';
import DeckDB from '../../shared/db/DeckDB';
import WindowTypes from '../../shared/ipc/WindowTypes';
import buildSampleDeck from './sampleDeck';

export default class PlayTestModule extends BaseModule {
  cardDb: CardDB;

  deckDb: DeckDB;

  boardWindow: BrowserWindow | null;

  handWindow: BrowserWindow | null;

  constructor(deps: ModuleDeps) {
    super({ name: 'PlayTest', label: 'Play Test', ...deps });

    this.cardDb = new CardDB();
    this.deckDb = new DeckDB();

    this.boardWindow = this.registerModuleWindow({
      type: WindowTypes.BOARD,
      width: 1560,
      height: 728,
      html: 'board.html',
      onReady: () => {
        if (process.env.START_MODULE === 'play-test') {
          this.openSampleDeck();
        }
      },
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
      handle: (arg: string) => {
        this.boardWindow?.webContents.send(IpcEvents.ETB, arg);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.DRAW,
      handle: (arg: string) => {
        this.handWindow?.webContents.send(IpcEvents.DRAW, arg);
      },
    });

    this.ipcBus.registerHandler({
      event: IpcEvents.PLAY_TEST,
      handle: (deckId: string) => {
        const cards = this.deckDb
          .getDeckCards({ deckId })
          .map((card, index) => {
            const row = this.cardDb.getCardById({ id: card.card_id });
            if (!row) return null;

            return new CardModel({
              ...row,
              keywords:
                row.keywords
                  ?.split(',')
                  .map((keyword) => keyword.toLowerCase()) ?? [],
              id: row.uuid,
              key: index,
            });
          })
          .filter((card): card is CardModel => card !== null);

        this.loadDeck(cards);
      },
    });
  }

  loadDeck = (cards: CardModel[]) => {
    if (!this.boardWindow || !this.handWindow) {
      console.warn('[PlayTest] play test windows were closed');
      return;
    }

    this.handWindow.show();
    this.boardWindow.show();
    this.boardWindow.webContents.send(IpcEvents.DECK_LOADED, cards);
  };

  openSampleDeck = () => {
    this.loadDeck(buildSampleDeck());
  };
}
