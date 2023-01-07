import CollectionStore from '../modules/collection/CollectionStore';

export default class RootStore {
  collectionStore: CollectionStore;

  constructor() {
    this.collectionStore = new CollectionStore();
  }
}
