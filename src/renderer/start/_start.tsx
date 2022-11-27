import { createRoot } from 'react-dom/client';
import Start from 'Start';

const container = document.getElementById('start')!;

if (container) {
  const root = createRoot(container);
  root.render(<Start />);
}
