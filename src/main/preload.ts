import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import BoardIpcHandler from './ipc/BoardIpcHandler';
import HandIpcHandler from './ipc/HandIpcHandler';

const boardIpcHandler = new BoardIpcHandler();
contextBridge.exposeInMainWorld('Board', boardIpcHandler);

const handIpcHandler = new HandIpcHandler();
contextBridge.exposeInMainWorld('Hand', handIpcHandler);
