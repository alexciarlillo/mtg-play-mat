import '../styles.css';

import { createRoot } from 'react-dom/client';

import Hand from '../modules/play-test/hand/Hand';
import HandStore from '../modules/play-test/hand/HandStore';
import { HandStoreProvider } from '../modules/play-test/hand/HandStoreContext';
import { ContextMenuProvider } from '../ui/ContextMenuProvider';

const container = document.getElementById('hand');

if (container) {
  const store = new HandStore();
  const root = createRoot(container);
  root.render(
    <ContextMenuProvider>
      <HandStoreProvider store={store}>
        <Hand />
      </HandStoreProvider>
    </ContextMenuProvider>
  );
}
