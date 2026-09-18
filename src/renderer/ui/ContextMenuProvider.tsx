import { createContext, ReactNode, useContext, useState } from 'react';

import ContextMenu from './ContextMenu';
import ContextMenuStore from './ContextMenuStore';

const ContextMenuContext = createContext<ContextMenuStore | null>(null);

export const ContextMenuProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() => new ContextMenuStore());
  return (
    <ContextMenuContext.Provider value={store}>
      {children}
      <ContextMenu />
    </ContextMenuContext.Provider>
  );
};

export const useContextMenu = () => {
  const store = useContext(ContextMenuContext);
  if (!store) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return store;
};
