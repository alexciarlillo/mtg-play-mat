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

  // calling IPC exposed from preload script
  window.electron.ipcRenderer.once('search-results', (results) => {
    // eslint-disable-next-line no-console
    console.log(results);
  });
  window.electron.ipcRenderer.sendMessage('search-query', ['slimefoot']);

  window.electron.ipcRenderer.on('etb', (id) => {
    console.log('etb', id);
    store.play(id);
  });
}
