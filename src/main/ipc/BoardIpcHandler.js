import { ipcRenderer } from 'electron';
import IpcChannel from './IpcChannel';
import IpcEvents from '../../shared/ipc/IpcEvents';

export default class BoardIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  draw = ({ id }) => {
    this.rendererChannel.Send(IpcEvents.DRAW, id);
  };
}
