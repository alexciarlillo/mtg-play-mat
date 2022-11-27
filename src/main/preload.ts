import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import BoardIpcHandler from 'BoardIpcHandler';
import HandIpcHandler from 'HandIpcHandler';
import MainIpcHandler from 'MainIpcHandler';

const boardIpcHandler = new BoardIpcHandler();
contextBridge.exposeInMainWorld('Board', boardIpcHandler);

const handIpcHandler = new HandIpcHandler();
contextBridge.exposeInMainWorld('Hand', handIpcHandler);

const mainIpcHandler = new MainIpcHandler();
contextBridge.exposeInMainWorld('Main', mainIpcHandler);
