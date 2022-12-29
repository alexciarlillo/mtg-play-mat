import { ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class BoardIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  draw = (card) => {
    this.rendererChannel.Send(IpcEvents.DRAW, card);
  };
}
