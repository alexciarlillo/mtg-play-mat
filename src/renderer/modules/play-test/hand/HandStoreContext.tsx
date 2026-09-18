import createStoreContext from '../../../core/createStoreContext';
import type HandStore from './HandStore';

export const [HandStoreProvider, useHandStore] =
  createStoreContext<HandStore>('HandStore');
