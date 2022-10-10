import { createRoot } from 'react-dom/client';
import Hand from './Hand';

const container = document.getElementById('hand')!;

if (container) {
  const root = createRoot(container);
  root.render(<Hand />);

  // calling IPC exposed from preload script
  window.electron.ipcRenderer.once('search-results', (results) => {
    // eslint-disable-next-line no-console
    console.log(results);
  });
  window.electron.ipcRenderer.sendMessage('search-query', ['slimefoot']);
}
