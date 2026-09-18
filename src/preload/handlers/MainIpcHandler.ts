import IpcChannel from '@shared/ipc/IpcChannel';
import { ipcRenderer } from 'electron';

export default class MainIpcHandler {
  rendererChannel = new IpcChannel({ ipc: ipcRenderer });
}
