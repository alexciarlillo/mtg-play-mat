import DeckBuilder from './modules/deck-builder/DeckBuilder';
import DeckViewer from './modules/deck-builder/DeckViewer';
import Collection from './modules/collection/Collection';
import App from './App';

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'decks', element: <DeckBuilder />, index: true },
      { path: 'decks/:deckId', element: <DeckViewer />, index: true },
      { path: 'collection', element: <Collection /> },
    ],
  },
];
