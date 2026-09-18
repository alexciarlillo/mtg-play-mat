import createStoreContext from '../../../core/createStoreContext';
import type BoardStore from './BoardStore';

export const [BoardStoreProvider, useBoardStore] =
  createStoreContext<BoardStore>('BoardStore');
