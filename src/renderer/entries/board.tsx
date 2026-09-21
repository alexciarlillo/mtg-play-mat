import '../styles.css';

import type { PrivateView, PublicView } from '@shared/game';
import type { OpponentState } from '@shared/net/remoteViews';
import { createRoot } from 'react-dom/client';

import Board from '../modules/play-test/board/Board';
import { FULL_PANEL_WIDTH } from '../modules/play-test/board/layout';
import {
  createViewStore,
  type ViewStore,
} from '../modules/play-test/viewStore';
import { CardPreviewProvider } from '../ui/CardPreview';
import { ContextMenuProvider } from '../ui/ContextMenuProvider';

const container = document.getElementById('board');

if (container) {
  const store = createViewStore<PublicView>({
    subscribe: window.api.onBoardView,
    fetch: window.api.getBoardView,
  });
  const opponent = createViewStore<OpponentState>({
    subscribe: window.api.onOpponentView,
    fetch: window.api.getOpponentView,
  });
  const root = createRoot(container);
  const render = (hand?: ViewStore<PrivateView>) =>
    root.render(
      <ContextMenuProvider>
        <CardPreviewProvider reserveRight={FULL_PANEL_WIDTH}>
          <Board store={store} opponent={opponent} hand={hand} />
        </CardPreviewProvider>
      </ContextMenuProvider>
    );
  // The mode is fixed for this window's life, and main only lets it read
  // the hand when it hosts one, so the hand store waits for the answer.
  render();
  window.api.getPlayTestStatus().then(
    (status) => {
      if (!status.handInBoard) return;
      render(
        createViewStore<PrivateView>({
          subscribe: window.api.onHandView,
          fetch: window.api.getHandView,
        })
      );
    },
    (err: unknown) => {
      console.error('[play-test] failed to load play test status', err);
    }
  );
}
