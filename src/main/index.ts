import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { CARD_SCHEME } from '@shared/cardImages';
import { app, BrowserWindow, net, protocol } from 'electron';

import CardDataService from './cardData/CardDataService';
import runIngestProcess from './cardData/runIngestProcess';
import { BULK_DATA_URL, scryfallHeaders } from './cardData/scryfall';
import {
  cardSchemePrivileges,
  createCardImageHandler,
} from './imageCache/cardProtocol';
import { registerDeepLinkScheme, watchDeepLinks } from './deepLink';
import { registerRequestHandlers, sendEvent } from './ipc';
import MenuBuilder from './menu';
import createCardDataHandlers from './modules/card-data/cardDataHandlers';
import createCollectionHandlers from './modules/collection/collectionHandlers';
import createDeckHandlers from './modules/decks/deckHandlers';
import ProfileStore from './modules/netplay/ProfileStore';
import { setupNetplay } from './modules/netplay/setupNetplay';
import PlayTest from './modules/play-test/PlayTest';
import createTokenHandlers from './modules/play-test/tokenHandlers';
import createSettingsHandlers from './modules/settings/settingsHandlers';
import SettingsStore from './modules/settings/SettingsStore';
import CardDB from './shared/db/CardDB';
import DeckDB from './shared/db/DeckDB';
import {
  cardDbPath,
  deckDbPath,
  getDbDir,
  imageCacheDir,
} from './shared/db/paths';
import { createWindow, whenLoaded } from './windows';

protocol.registerSchemesAsPrivileged([cardSchemePrivileges]);

let appWindow: BrowserWindow | null = null;

let menu: MenuBuilder | null = null;

const testHooksEnabled = process.env.MTG_PLAY_MAT_TEST_HOOKS === '1';

// Tests point this at a local fixture server. Without one, tests skip the
// launch check so they never pull the real ~80 MB bulk file.
const bulkDataUrlOverride = process.env.MTG_PLAY_MAT_BULK_DATA_URL;

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

  menu = new MenuBuilder(window, {
    openSamplePlayTest: playTest.openSampleDeck,
    openSettings: () => openSettings(playTest),
    playTestOpen: () => playTest.isOpen,
    runGameCommand: playTest.runMenuCommand,
  });
  menu.buildMenu();
  return window;
};

// Reopens the app window if it was closed (macOS keeps the app running).
const openSettings = (playTest: PlayTest) => {
  const window = appWindow ?? createAppWindow(playTest);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  void whenLoaded(window).then((loaded) => {
    if (loaded) sendEvent(window, 'navigate', 'settings');
  });
};

const start = (onDeepLink: ReturnType<typeof watchDeepLinks>) => {
  mkdirSync(getDbDir(), { recursive: true });
  const appVersion = app.getVersion();
  const cardDb = new CardDB(cardDbPath());
  const deckDb = new DeckDB(deckDbPath());
  const settings = new SettingsStore(
    path.join(app.getPath('userData'), 'settings.json')
  );
  settings.onChange((next) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      sendEvent(window, 'settingsChanged', next);
    });
  });
  const profile = new ProfileStore(settings);
  const playTest = new PlayTest({
    cardDb,
    deckDb,
    playerId: profile.playerId,
    playerName: () => profile.name,
  });
  playTest.onStatusChange(() => menu?.refresh());
  const online = setupNetplay({
    profile,
    settings,
    playTest,
    getAppWindow: () => appWindow,
    testHooks: testHooksEnabled,
  });

  const cardData = new CardDataService({
    cardDb,
    appVersion,
    bulkDataUrl: bulkDataUrlOverride ?? BULK_DATA_URL,
    runIngest: runIngestProcess,
    onStatus: (status) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        sendEvent(window, 'cardDataStatus', status);
      });
    },
  });

  protocol.handle(
    CARD_SCHEME,
    createCardImageHandler({
      cacheDir: imageCacheDir(),
      lookupImage: cardDb.getFaceImage,
      fetch: (url) => net.fetch(url, { headers: scryfallHeaders(appVersion) }),
    })
  );

  registerRequestHandlers(
    {
      ...createDeckHandlers({ cardDb, deckDb }),
      ...createCollectionHandlers({ cardDb }),
      ...createCardDataHandlers({ cardData }),
      ...playTest.handlers,
      ...createTokenHandlers({ cardDb }),
      ...online.handlers,
      ...createSettingsHandlers({ settings }),
    },
    {
      ...online.guards,
      ...playTest.guards,
      // The hidden net window has no reason to change preferences.
      updateSettings: (sender) => !online.netWindow.isNetSender(sender),
    }
  );

  createAppWindow(playTest);

  onDeepLink((link) => {
    if (link) online.netplay.receiveLink(link);
    if (!appWindow) createAppWindow(playTest);
    if (appWindow?.isMinimized()) appWindow.restore();
    appWindow?.focus();
  });

  if (!testHooksEnabled || bulkDataUrlOverride) void cardData.check();

  if (process.env.START_MODULE === 'play-test') {
    void playTest.openSampleDeck();
  }

  // Lets end-to-end tests open a play test in any build without driving
  // the dev-only menu. Never set outside tests.
  if (testHooksEnabled) {
    Object.assign(globalThis, {
      testHooks: {
        openSamplePlayTest: playTest.openSampleDeck,
        openSampleCommanderPlayTest: (seed?: number) =>
          playTest.openSampleDeck(seed, 'commander'),
        gameState: () => playTest.gameState,
        profile: () => profile.profile,
        settings: () => settings.settings,
      },
    });
  }

  app.on('activate', () => {
    if (appWindow === null) createAppWindow(playTest);
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// A second launch (e.g. from a mtgplaymat:// link on Windows or Linux)
// hands its argv to the running app and exits. The lock is per user data
// directory, so separate profiles can still run side by side.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerDeepLinkScheme(testHooksEnabled);
  const onDeepLink = watchDeepLinks();
  app
    .whenReady()
    .then(() => start(onDeepLink))
    .catch(console.error);
}
