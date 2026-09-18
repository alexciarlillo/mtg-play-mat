import type BoardIpcHandler from './handlers/BoardIpcHandler';
import type CollectionIpcHandler from './handlers/CollectionIpcHandler';
import type DeckBuilderIpcHandler from './handlers/DeckBuilderIpcHandler';
import type HandIpcHandler from './handlers/HandIpcHandler';
import type MainIpcHandler from './handlers/MainIpcHandler';
import type PlayTestIpcHandler from './handlers/PlayTestIpcHandler';

declare global {
  interface Window {
    DeckBuilder: DeckBuilderIpcHandler;
    Board: BoardIpcHandler;
    Hand: HandIpcHandler;
    PlayTest: PlayTestIpcHandler;
    Main: MainIpcHandler;
    Collection: CollectionIpcHandler;
  }
}
