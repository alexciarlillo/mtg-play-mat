import BoardIpcHandler from 'BoardIpcHandler';
import DeckBuilderIpcHandler from 'DeckBuilderIpcHandler';
import { contextBridge } from 'electron';
import HandIpcHandler from 'HandIpcHandler';
import MainIpcHandler from 'MainIpcHandler';
import PlayTestIpcHandler from 'PlayTestIpcHandler';

import CollectionIpcHandler from './modules/collection/CollectionIpcHandler';

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

const collectionIpcHandler = new CollectionIpcHandler();
contextBridge.exposeInMainWorld('Collection', collectionIpcHandler);
