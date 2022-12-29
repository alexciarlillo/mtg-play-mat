import { ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class HandIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  play = (card) => {
    this.rendererChannel.Send(IpcEvents.PLAY, card);
  };
}
