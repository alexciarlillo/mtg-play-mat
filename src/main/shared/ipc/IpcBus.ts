import { ipcMain } from 'electron';
import IpcEvents from 'IpcEvents';
import IpcChannel from './IpcChannel';

export default class IpcBus {
  constructor() {
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
    this._initializeHandlers();

    this.eventHandlers = {};
  }

  registerHandler = ({ event, handle }) => {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(handle);
  };

  _initializeHandlers = () => {
    // TODO: Enumerate and register automatically

    this.mainChannel.On(IpcEvents.PLAY, async (event, arg) => {
      this.eventHandlers[IpcEvents.PLAY]?.forEach((handle) => {
        handle(arg);
      });
    });

    this.mainChannel.On(IpcEvents.DRAW, async (event, arg) => {
      this.eventHandlers[IpcEvents.PLAY]?.forEach((handle) => {
        handle(arg);
      });
    });

    this.mainChannel.On(IpcEvents.PLAY_TEST, async (event, arg) => {
      this.eventHandlers[IpcEvents.PLAY_TEST]?.forEach((handle) => {
        handle(arg);
      });
    });

    // TODO: fix this. defer this to some type of singleton manager
    // instance??
    // this.mainChannel.On(IpcEvents.IMPORT, async (event, arg) => {
    //   const cardDb = new CardDB();

    //   const deckPath =
    //     process.env.NODE_ENV === 'development'
    //       ? path.join(webpackPaths.appPath, './db/slimefoot.txt')
    //       : path.join(__dirname, '../../db/slimefoot.txt');

    //   const importer = new DeckImporter({ cardDb });
    //   const cards = importer.importFromFile({ filePath: deckPath });
    //   this.windowsByType[WindowTypes.BOARD]?.send(IpcEvents.DECK_LOADED, cards);
    // });
  };
}
