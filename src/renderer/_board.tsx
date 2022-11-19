import { createRoot } from 'react-dom/client';
import Board from './Board';
import BoardStore, { BoardStoreProvider } from './BoardStore';
import { ContextMenuProvider } from './ContextMenuProvider';

const container = document.getElementById('board')!;

if (container) {
  const store = new BoardStore();
  const root = createRoot(container);
  root.render(
    <BoardStoreProvider store={store}>
      <ContextMenuProvider>
        <Board />
      </ContextMenuProvider>
    </BoardStoreProvider>
  );

  window.electron.ipcRenderer.on('newdeck', (cards) => {
    console.log('newdeck', cards.length);
    store.reset(cards);
  });
}
