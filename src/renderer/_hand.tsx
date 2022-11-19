import { createRoot } from 'react-dom/client';
import Hand from './Hand';
import HandStore, { HandStoreProvider } from './HandStore';

const container = document.getElementById('hand')!;

if (container) {
  const store = new HandStore();
  const root = createRoot(container);
  root.render(
    <HandStoreProvider store={store}>
      <Hand />
    </HandStoreProvider>
  );
}
