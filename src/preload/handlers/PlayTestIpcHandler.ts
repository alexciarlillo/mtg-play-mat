import IpcChannel from '@shared/ipc/IpcChannel';
import IpcEvents from '@shared/ipc/IpcEvents';
import { ipcRenderer } from 'electron';

export default class PlayTestIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });

  load = ({ deckId }: { deckId: string }) => {
    this.rendererChannel.Send(IpcEvents.PLAY_TEST, deckId);
  };
}
