import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { ipcRenderer } from 'electron';

export default class BoardIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });

  draw = (card: string) => {
    this.rendererChannel.Send(IpcEvents.DRAW, card);
  };
}
