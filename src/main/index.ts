import { app, BrowserWindow } from 'electron';

import { registerRequestHandlers } from './ipc';
import MenuBuilder from './menu';
import createCollectionHandlers from './modules/collection/collectionHandlers';
import createDeckHandlers from './modules/decks/deckHandlers';
import PlayTest from './modules/play-test/PlayTest';
import CardDB from './shared/db/CardDB';
import DeckDB from './shared/db/DeckDB';
import { createWindow } from './windows';

let appWindow: BrowserWindow | null = null;

const createAppWindow = (playTest: PlayTest) => {
  const window = createWindow({ html: 'app.html', width: 1500, height: 500 });
  appWindow = window;

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    appWindow = null;
    // The board and hand are secondary windows; without the app window
    // there is nothing left to drive them.
    if (process.platform !== 'darwin') app.quit();
  });

  new MenuBuilder(window, {
    openSamplePlayTest: playTest.openSampleDeck,
  }).buildMenu();
};

const start = () => {
  const cardDb = new CardDB();
  const deckDb = new DeckDB();
  const playTest = new PlayTest({ cardDb, deckDb });

  registerRequestHandlers({
    ...createDeckHandlers({ cardDb, deckDb }),
    ...createCollectionHandlers({ cardDb }),
    ...playTest.handlers,
  });

  createAppWindow(playTest);

  if (process.env.START_MODULE === 'play-test') {
    void playTest.openSampleDeck();
  }

  // Lets end-to-end tests open a play test in any build without driving
  // the dev-only menu. Never set outside tests.
  if (process.env.MTG_PLAY_MAT_TEST_HOOKS === '1') {
    Object.assign(globalThis, {
      testHooks: { openSamplePlayTest: playTest.openSampleDeck },
    });
  }

  app.on('activate', () => {
    if (appWindow === null) createAppWindow(playTest);
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(start).catch(console.error);
