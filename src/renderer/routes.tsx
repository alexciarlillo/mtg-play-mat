import { Navigate, RouteObject } from 'react-router';

import App from './App';
import DeckBuilder from './modules/deck-builder/DeckBuilder';
import DeckViewer from './modules/deck-builder/DeckViewer';
import PlayOnline from './modules/online/PlayOnline';
import Settings from './modules/settings/Settings';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="decks" replace /> },
      { path: 'decks', element: <DeckBuilder /> },
      { path: 'decks/:deckId', element: <DeckViewer /> },
      { path: 'online', element: <PlayOnline /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
];
