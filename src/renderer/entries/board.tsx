import '../styles.css';

import { createRoot } from 'react-dom/client';

import Board from '../modules/play-test/board/Board';
import BoardStore from '../modules/play-test/board/BoardStore';
import { BoardStoreProvider } from '../modules/play-test/board/BoardStoreContext';
import { ContextMenuProvider } from '../ui/ContextMenuProvider';

const container = document.getElementById('board');

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
}
