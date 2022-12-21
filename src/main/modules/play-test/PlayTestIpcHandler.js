import { ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class PlayTestIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  load = ({ deckId }) => {
    this.rendererChannel.Send(IpcEvents.PLAY_TEST, deckId);
  };
}
