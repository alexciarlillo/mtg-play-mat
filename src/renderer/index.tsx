import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);

// calling IPC exposed from preload script
window.electron.ipcRenderer.once('search-results', (results) => {
  // eslint-disable-next-line no-console
  console.log(results);
});
window.electron.ipcRenderer.sendMessage('search-query', ['slimefoot']);
