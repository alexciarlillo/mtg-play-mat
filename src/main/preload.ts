import { contextBridge } from 'electron';

import CollectionIpcHandler from './modules/collection/CollectionIpcHandler';
import DeckBuilderIpcHandler from './modules/deck-builder/DeckBuilderIpcHandler';
import BoardIpcHandler from './modules/play-test/BoardIpcHandler';
import HandIpcHandler from './modules/play-test/HandIpcHandler';
import PlayTestIpcHandler from './modules/play-test/PlayTestIpcHandler';
import MainIpcHandler from './shared/ipc/MainIpcHandler';

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
