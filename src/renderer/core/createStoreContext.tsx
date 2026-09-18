import { createContext, ReactNode, useContext } from 'react';

// Builds a provider/hook pair for a store instance created by the caller.
const createStoreContext = <T,>(name: string) => {
  const Context = createContext<T | null>(null);

  const Provider = ({ children, store }: { children: ReactNode; store: T }) => (
    <Context.Provider value={store}>{children}</Context.Provider>
  );

  const useStore = () => {
    const store = useContext(Context);
    if (!store) {
      throw new Error(`use${name} must be used within ${name}Provider`);
    }
    return store;
  };

  return [Provider, useStore] as const;
};

export default createStoreContext;
