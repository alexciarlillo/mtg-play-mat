import { contextBridge } from 'electron';

import BoardIpcHandler from './handlers/BoardIpcHandler';
import CollectionIpcHandler from './handlers/CollectionIpcHandler';
import DeckBuilderIpcHandler from './handlers/DeckBuilderIpcHandler';
import HandIpcHandler from './handlers/HandIpcHandler';
import MainIpcHandler from './handlers/MainIpcHandler';
import PlayTestIpcHandler from './handlers/PlayTestIpcHandler';

contextBridge.exposeInMainWorld('DeckBuilder', new DeckBuilderIpcHandler());
contextBridge.exposeInMainWorld('Board', new BoardIpcHandler());
contextBridge.exposeInMainWorld('Hand', new HandIpcHandler());
contextBridge.exposeInMainWorld('PlayTest', new PlayTestIpcHandler());
contextBridge.exposeInMainWorld('Main', new MainIpcHandler());
contextBridge.exposeInMainWorld('Collection', new CollectionIpcHandler());
