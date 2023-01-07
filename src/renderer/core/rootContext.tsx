import React, { ReactNode, useContext } from 'react';

import RootStore from './rootStore';

let store: RootStore;

// create the context
const StoreContext = React.createContext<RootStore | undefined>(undefined);

// create the provider component
export const RootStoreProvider = ({ children }: { children: ReactNode }) => {
  const root = store ?? new RootStore();

  return <StoreContext.Provider value={root}>{children}</StoreContext.Provider>;
};

// create the hook
export const useRootStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useRootStore must be used within RootStoreProvider');
  }

  return context;
};

export default RootStoreProvider;
