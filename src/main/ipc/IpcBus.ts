import path from 'path';
import { ipcMain } from 'electron';
import IpcEvents from 'IpcEvents';
import IpcChannel from 'IpcChannel';
import WindowTypes from 'WindowTypes';
import DeckImporter from 'DeckImporter';
import CardDB from 'CardDB';
import webpackPaths from '../../../.erb/configs/webpack.paths';

export default class IpcBus {
  constructor() {
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
    this.windowsByType = {};
    this._initializeHandlers();
  }

  registerWindow = ({ type, window }) => {
    if (this.windowsByType[type]) {
      throw new Error(`Window ${type} is already registered with the IPC Bus`);
    }

    this.windowsByType[type] = window;
  };

  _initializeHandlers = () => {
    this.mainChannel.On(IpcEvents.PLAY, async (event, arg) => {
      this.windowsByType[WindowTypes.BOARD]?.send(IpcEvents.ETB, arg);
    });

    this.mainChannel.On(IpcEvents.DRAW, async (event, arg) => {
      this.windowsByType[WindowTypes.HAND]?.send(IpcEvents.DRAW, arg);
    });

    this.mainChannel.On(IpcEvents.PLAY_TEST, async (event, arg) => {
      if (
        this.windowsByType[WindowTypes.BOARD] &&
        this.windowsByType[WindowTypes.HAND]
      ) {
        this.windowsByType[WindowTypes.BOARD].show();
        this.windowsByType[WindowTypes.HAND].show();
      }
    });

    // TODO: fix this. defer this to some type of singleton manager
    // instance??
    this.mainChannel.On(IpcEvents.IMPORT, async (event, arg) => {
      const cardDb = new CardDB();

      const deckPath =
        process.env.NODE_ENV === 'development'
          ? path.join(webpackPaths.appPath, './db/slimefoot.txt')
          : path.join(__dirname, '../../db/slimefoot.txt');

      const importer = new DeckImporter({ cardDb });
      const cards = importer.importFromFile({ filePath: deckPath });
      this.windowsByType[WindowTypes.BOARD]?.send(IpcEvents.DECK_LOADED, cards);
    });
  };
}
