import createStoreContext from '../../core/createStoreContext';
import type DeckStore from './DeckStore';

export const [DeckStoreProvider, useDeckStore] =
  createStoreContext<DeckStore>('DeckStore');
