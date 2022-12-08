import { createHashRouter, RouterProvider } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { routes } from './routes';

const router = createHashRouter(routes);

const container = document.getElementById('root')!;

if (container) {
  createRoot(container).render(<RouterProvider router={router} />);
}
