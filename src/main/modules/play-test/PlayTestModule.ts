import IpcEvents from 'IpcEvents';
import CardDB from '../../shared/db/CardDB';
import BaseModule from '../../shared/BaseModule';
import WindowTypes from '../../shared/ipc/WindowTypes';

export default class PlayTestModule extends BaseModule {
  constructor({ ...rest }) {
    super({ name: 'PlayTestModule', ...rest });

    this.cardDb = new CardDB();

    this.boardWindow = this.registerModuleWindow({
      type: WindowTypes.BOARD,
      width: 1560,
      height: 728,
      html: 'board.html',
      onReady: (window) => {
        if (process.env.START_MODULE === this.name) {
          window.show();
        }
      },
    });

    this.handWindow = this.registerModuleWindow({
      type: WindowTypes.HAND,
      width: 1200,
      height: 330,
      html: 'hand.html',
      frame: false,
      onReady: (window) => {
        if (process.env.START_MODULE === this.name) {
          window.show();
        }
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
      handle: () => {
        this.handWindow?.show();
        this.boardWindow?.show();
      },
    });
  }

  open = () => {};

  close = () => {};
}
