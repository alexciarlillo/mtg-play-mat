import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { CARD_SCHEME } from '@shared/cardImages';
import { relayHost } from '@shared/debug';
import { MAT_FILE_EXTENSIONS, MAT_SCHEME } from '@shared/mat';
import { app, BrowserWindow, dialog, nativeImage, protocol } from 'electron';

import CardDataService from './cardData/CardDataService';
import runIngestProcess from './cardData/runIngestProcess';
import { BULK_DATA_URL, scryfallHeaders } from './cardData/scryfall';
import {
  cardSchemePrivileges,
  createCardImageHandler,
} from './imageCache/cardProtocol';
import { registerDeepLinkScheme, watchDeepLinks } from './deepLink';
import DebugLog from './debugLog';
import { registerRequestHandlers, sendEvent } from './ipc';
import MenuBuilder from './menu';
import createCardDataHandlers from './modules/card-data/cardDataHandlers';
import createDebugHandlers from './modules/debug/debugHandlers';
import createMatHandlers from './modules/mat/matHandlers';
import createCollectionHandlers from './modules/collection/collectionHandlers';
import createDeckHandlers from './modules/decks/deckHandlers';
import MatStore from './mats/MatStore';
import { createMatImageHandler, matSchemePrivileges } from './mats/matProtocol';
import type Netplay from './modules/netplay/Netplay';
import ProfileStore from './modules/netplay/ProfileStore';
import { relaySettings } from './modules/netplay/relayConfig';
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
  matsDir,
} from './shared/db/paths';
import { createWindow, whenLoaded } from './windows';

protocol.registerSchemesAsPrivileged([
  cardSchemePrivileges,
  matSchemePrivileges,
]);

let appWindow: BrowserWindow | null = null;

let menu: MenuBuilder | null = null;

// The app window, and so the menu, can exist before netplay is set up,
// so the menu reads the instance through this holder instead of taking
// it as a parameter.
let netplay: Netplay | null = null;

// Set once the app is ready; the exception handlers below are installed
// before that, so they check it.
let debugLog: DebugLog | null = null;

// Every window logs into one buffer, and the Play online page renders
// it. Pushes are coalesced: a busy pod would otherwise push per message.
let debugPush: ReturnType<typeof setTimeout> | null = null;

const pushDebugLog = () => {
  if (debugPush) return;
  debugPush = setTimeout(() => {
    debugPush = null;
    if (debugLog) sendEvent(appWindow, 'debugLog', debugLog.snapshot());
  }, 150);
};

// Multiplayer is what the log is for, but an exception anywhere else is
// worth catching too: it is usually the reason multiplayer stopped.
process.on('uncaughtException', (err) => {
  if (debugLog) debugLog.caught('app', 'uncaught exception', err);
  else console.error(err);
});

process.on('unhandledRejection', (reason) => {
  if (debugLog) debugLog.caught('app', 'unhandled rejection', reason);
  else console.error(reason);
});

const testHooksEnabled = process.env.MTG_PLAY_MAT_TEST_HOOKS === '1';

// Tests point this at a local fixture server. Without one, tests skip the
// launch check so they never pull the real ~80 MB bulk file.
const bulkDataUrlOverride = process.env.MTG_PLAY_MAT_BULK_DATA_URL;

// Fake opponents are refused once a session is live, so the menu greys
// out rather than offering a click it cannot honour.
const fakeOpponentsAllowed = () => {
  const state = netplay?.netState;
  return state !== undefined && state.role === null && state.phase === 'idle';
};

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
    fakeOpponents: () => netplay?.fakeOpponents ?? 0,
    fakeOpponentsEnabled: fakeOpponentsAllowed,
    openSamplePlayTest: playTest.openSampleDeck,
    openSettings: () => openSettings(playTest),
    playTestOpen: () => playTest.isOpen,
    runGameCommand: playTest.runMenuCommand,
    setFakeOpponents: (count) => {
      netplay?.setFakeOpponents(count);
      // The count may have been refused, so rebuild from the real one.
      menu?.refresh();
    },
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

// End-to-end tests cannot drive a native file dialog, so under test
// hooks they name the file the next choice will return instead.
let testMatFile: string | null = null;

// The player's own picture for their play area. Opened over the app
// window so it is modal to it on macOS.
const pickMatFile = async (
  parent: BrowserWindow | null
): Promise<string | null> => {
  const options = {
    title: 'Choose a play area background',
    properties: ['openFile' as const],
    filters: [{ name: 'Images', extensions: MAT_FILE_EXTENSIONS }],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
};

const start = (onDeepLink: ReturnType<typeof watchDeepLinks>) => {
  mkdirSync(getDbDir(), { recursive: true });
  const appVersion = app.getVersion();
  const cardDb = new CardDB(cardDbPath());
  const deckDb = new DeckDB(deckDbPath());
  const settings = new SettingsStore(
    path.join(app.getPath('userData'), 'settings.json')
  );
  debugLog = new DebugLog({
    // The relay as it will actually be used, which an environment
    // variable can override.
    env: () => {
      const relay = relaySettings(settings.settings);
      return {
        appVersion,
        platform:
          `${process.platform} ${process.arch} ` +
          `electron ${process.versions.electron}`,
        relayHost: relayHost(relay.baseUrl),
        relayKeySet: relay.appKey.trim() !== '',
      };
    },
    onChange: pushDebugLog,
  });
  const log = debugLog;
  log.scoped('app').info('app started', { version: appVersion });
  settings.onChange((next) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      sendEvent(window, 'settingsChanged', next);
    });
  });
  const mats = new MatStore({ dir: matsDir(), encoder: nativeImage });
  const profile = new ProfileStore(settings);
  const playTest = new PlayTest({
    cardDb,
    deckDb,
    playerId: profile.playerId,
    playerName: () => profile.name,
    handInBoard: () => settings.settings.handInBoard,
  });
  playTest.onStatusChange(() => menu?.refresh());
  const online = setupNetplay({
    profile,
    settings,
    playTest,
    getAppWindow: () => appWindow,
    testHooks: testHooksEnabled,
    log,
    mats,
  });
  netplay = online.netplay;

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

  protocol.handle(MAT_SCHEME, createMatImageHandler(mats));

  protocol.handle(
    CARD_SCHEME,
    createCardImageHandler({
      cacheDir: imageCacheDir(),
      lookupImage: cardDb.getFaceImage,
      // Node's fetch, not Electron's: net.fetch decodes response headers
      // as UTF-8, and Scryfall's content-disposition carries a raw star
      // for promo printings, which throws past our catch and kills main.
      fetch: (url) => fetch(url, { headers: scryfallHeaders(appVersion) }),
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
      ...createDebugHandlers({ log }),
      ...createMatHandlers({
        mats,
        settings,
        pickFile: async () => {
          if (testHooksEnabled && testMatFile) {
            const file = testMatFile;
            testMatFile = null;
            return file;
          }
          return pickMatFile(appWindow);
        },
      }),
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
        chooseMatFile: (file: string) => {
          testMatFile = file;
        },
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
