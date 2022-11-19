import { ipcMain } from 'electron';
import IpcEvents from '../../shared/ipc/IpcEvents';
import IpcChannel from './IpcChannel';
import WindowTypes from './WindowTypes';

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
  };
}
