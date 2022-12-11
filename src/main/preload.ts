import { contextBridge } from 'electron';
import PlayTestIpcHandler from 'PlayTestIpcHandler';
import DeckBuilderIpcHandler from 'DeckBuilderIpcHandler';
import BoardIpcHandler from 'BoardIpcHandler';
import HandIpcHandler from 'HandIpcHandler';
import MainIpcHandler from 'MainIpcHandler';

const deckBuilderIpcHandler = new DeckBuilderIpcHandler();
contextBridge.exposeInMainWorld('DeckBuilder', deckBuilderIpcHandler);

const boardIpcHandler = new BoardIpcHandler();
contextBridge.exposeInMainWorld('Board', boardIpcHandler);

const handIpcHandler = new HandIpcHandler();
contextBridge.exposeInMainWorld('Hand', handIpcHandler);

const playTestIpcHandler = new PlayTestIpcHandler();
contextBridge.exposeInMainWorld('PlayTest', playTestIpcHandler);

const mainIpcHandler = new MainIpcHandler();
contextBridge.exposeInMainWorld('Main', mainIpcHandler);
