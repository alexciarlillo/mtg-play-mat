import { createRoot } from 'react-dom/client';
import DeckBuilder from 'DeckBuilder';

const container = document.getElementById('deck-builder')!;

if (container) {
  const root = createRoot(container);
  root.render(<DeckBuilder />);
}
