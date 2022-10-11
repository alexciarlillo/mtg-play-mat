import { createRoot } from 'react-dom/client';
import Battlefield from './Battlefield';
import BattlefieldStore from './BattlefieldStore';

const container = document.getElementById('battlefield')!;

if (container) {
  const store = new BattlefieldStore();
  const root = createRoot(container);
  root.render(<Battlefield store={store} />);

  // calling IPC exposed from preload script
  window.electron.ipcRenderer.once('search-results', (results) => {
    // eslint-disable-next-line no-console
    console.log(results);
  });
  window.electron.ipcRenderer.sendMessage('search-query', ['slimefoot']);

  window.electron.ipcRenderer.on('etb', (id) => {
    console.log('etb', id);
    store.play(id);
  });
}
