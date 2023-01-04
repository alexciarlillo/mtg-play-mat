import CollectionIpcHandler from './modules/collection/CollectionIpcHandler';
import DeckBuilderIpcHandler from './modules/deck-builder/DeckBuilderIpcHandler';
import BoardIpcHandler from './modules/play-test/BoardIpcHandler';
import HandIpcHandler from './modules/play-test/HandIpcHandler';
import PlayTestIpcHandler from './modules/play-test/PlayTestIpcHandler';
import MainIpcHandler from './shared/ipc/MainIpcHandler';

declare global {
  interface Window {
    DeckBuilder: DeckBuilderIpcHandler;
    Board: BoardIpcHandler;
    Hand: HandIpcHandler;
    PlayTest: typeof PlayTestIpcHandler;
    Main: typeof MainIpcHandler;
    Collection: CollectionIpcHandler;
  }
}
