import DeckBuilder from './modules/deck-builder/DeckBuilder';
import Collection from './modules/collection/Collection';
import App from './App';

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'deck-builder', element: <DeckBuilder />, index: true },
      { path: 'collection', element: <Collection /> },
    ],
  },
];
