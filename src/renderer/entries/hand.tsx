import '../styles.css';

import type { PrivateView } from '@shared/game';
import { createRoot } from 'react-dom/client';

import Hand from '../modules/play-test/hand/Hand';
import { createViewStore } from '../modules/play-test/viewStore';
import { CardPreviewProvider } from '../ui/CardPreview';
import { ContextMenuProvider } from '../ui/ContextMenuProvider';

const container = document.getElementById('hand');

if (container) {
  const store = createViewStore<PrivateView>({
    subscribe: window.api.onHandView,
    fetch: window.api.getHandView,
  });
  const root = createRoot(container);
  root.render(
    <ContextMenuProvider>
      <CardPreviewProvider>
        <Hand store={store} />
      </CardPreviewProvider>
    </ContextMenuProvider>
  );
}
