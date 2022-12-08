import { contextBridge } from 'electron';
import PlayTestIpcHandler from 'PlayTestIpcHandler';
import BoardIpcHandler from 'BoardIpcHandler';
import HandIpcHandler from 'HandIpcHandler';
import MainIpcHandler from 'MainIpcHandler';

const boardIpcHandler = new BoardIpcHandler();
contextBridge.exposeInMainWorld('Board', boardIpcHandler);

const handIpcHandler = new HandIpcHandler();
contextBridge.exposeInMainWorld('Hand', handIpcHandler);

const playTestIpcHandler = new PlayTestIpcHandler();
contextBridge.exposeInMainWorld('PlayTest', playTestIpcHandler);

const mainIpcHandler = new MainIpcHandler();
contextBridge.exposeInMainWorld('Main', mainIpcHandler);
