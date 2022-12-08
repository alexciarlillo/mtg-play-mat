import { createHashRouter, RouterProvider } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { routes } from './routes';

const router = createHashRouter(routes);

createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
