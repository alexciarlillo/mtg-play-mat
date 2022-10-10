import { createRoot } from 'react-dom/client';
import Battlefield from './Battlefield';

const container = document.getElementById('battlefield')!;

if (container) {
  const root = createRoot(container);
  root.render(<Battlefield />);

  // calling IPC exposed from preload script
  window.electron.ipcRenderer.once('search-results', (results) => {
    // eslint-disable-next-line no-console
    console.log(results);
  });
  window.electron.ipcRenderer.sendMessage('search-query', ['slimefoot']);
}
