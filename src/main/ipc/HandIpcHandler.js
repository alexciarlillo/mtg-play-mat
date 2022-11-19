import { ipcRenderer } from 'electron';
import IpcChannel from './IpcChannel';
import IpcEvents from '../../shared/ipc/IpcEvents';

export default class HandIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  play = ({ id }) => {
    this.rendererChannel.Send(IpcEvents.PLAY, id);
  };
}
