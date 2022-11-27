import { ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class MainIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  playTest = () => {
    this.rendererChannel.Send(IpcEvents.PLAY_TEST);
  };
}
