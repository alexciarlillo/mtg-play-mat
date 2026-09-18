import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { ipcRenderer } from 'electron';

export default class HandIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });

  play = (card: string) => {
    this.rendererChannel.Send(IpcEvents.PLAY, card);
  };
}
