import { createContext, ReactNode, useContext, useState } from 'react';

import RootStore from './rootStore';

const StoreContext = createContext<RootStore | undefined>(undefined);

export const RootStoreProvider = ({ children }: { children: ReactNode }) => {
  // Created once per provider so store IPC listeners aren't re-registered
  // on every render.
  const [root] = useState(() => new RootStore());

  return <StoreContext.Provider value={root}>{children}</StoreContext.Provider>;
};

export const useRootStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useRootStore must be used within RootStoreProvider');
  }

  return context;
};

export default RootStoreProvider;
