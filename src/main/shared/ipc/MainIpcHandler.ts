import { ipcRenderer } from 'electron';
import IpcChannel from 'IpcChannel';
import IpcEvents from 'IpcEvents';

export default class MainIpcHandler {
  constructor() {
    this.rendererChannel = new IpcChannel({ ipc: ipcRenderer });
  }

  openModule = ({ name }) => {
    this.rendererChannel.Send(IpcEvents.OPEN_MODULE, name);
  };

  listModules = () => {
    this.rendererChannel.Send(IpcEvents.LIST_MODULES);
  };
}
