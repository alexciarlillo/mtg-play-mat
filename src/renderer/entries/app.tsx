import '../styles.css';

import { createRoot } from 'react-dom/client';
import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { routes } from '../routes';

const router = createHashRouter(routes);

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(<RouterProvider router={router} />);
}
