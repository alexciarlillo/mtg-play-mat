import '../styles.css';

import type { PublicView } from '@shared/game';
import { createRoot } from 'react-dom/client';

import Board from '../modules/play-test/board/Board';
import { createViewStore } from '../modules/play-test/viewStore';
import { ContextMenuProvider } from '../ui/ContextMenuProvider';

const container = document.getElementById('board');

if (container) {
  const store = createViewStore<PublicView>({
    subscribe: window.api.onBoardView,
    fetch: window.api.getBoardView,
  });
  const root = createRoot(container);
  root.render(
    <ContextMenuProvider>
      <Board store={store} />
    </ContextMenuProvider>
  );
}
