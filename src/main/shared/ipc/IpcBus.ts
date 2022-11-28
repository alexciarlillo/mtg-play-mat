import { ipcMain } from 'electron';
import IpcEvents from 'IpcEvents';
import IpcChannel from './IpcChannel';

export default class IpcBus {
  constructor() {
    this.mainChannel = new IpcChannel({ ipc: ipcMain });
    this.eventHandlers = {};

    Object.keys(IpcEvents).forEach((ipcEvent) => {
      this.mainChannel.On(ipcEvent, async (event, arg) => {
        this.eventHandlers[ipcEvent]?.forEach((handle) => {
          handle(arg);
        });
      });
    });

    this.initializeMainHandlers();
  }

  registerHandler = ({ event, handle }) => {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(handle);
  };

  initializeMainHandlers = () => {
    // TODO: Enumerate and register automatically
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
