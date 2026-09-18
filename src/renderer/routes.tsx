import { Navigate, RouteObject } from 'react-router';

import App from './App';
import Collection from './modules/collection/Collection';
import DeckBuilder from './modules/deck-builder/DeckBuilder';
import DeckViewer from './modules/deck-builder/DeckViewer';
import PlayOnline from './modules/online/PlayOnline';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="decks" replace /> },
      { path: 'decks', element: <DeckBuilder /> },
      { path: 'decks/:deckId', element: <DeckViewer /> },
      { path: 'collection', element: <Collection /> },
      { path: 'online', element: <PlayOnline /> },
    ],
  },
];
