import type { IceServer, NetConfig } from '@shared/net/lobby';
import { relayHost } from '@shared/debug';
import { app, BrowserWindow, screen } from 'electron';

import type DebugLog from '../../debugLog';
import type MatStore from '../../mats/MatStore';
import { type RequestHandlers, type SenderGuards, sendEvent } from '../../ipc';
import type PlayTest from '../play-test/PlayTest';
import type SettingsStore from '../settings/SettingsStore';
import Netplay from './Netplay';
import NetWindow from './NetWindow';
import type ProfileStore from './ProfileStore';
import { relaySettings } from './relayConfig';
import RelayTransport from './RelayTransport';

const PUBLIC_STUN: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

// Tests must never depend on outside STUN servers, so they default to
// none (host candidates only) unless they pass their own list.
const iceServers = (testHooks: boolean): IceServer[] => {
  if (!testHooks) return PUBLIC_STUN;
  const override = process.env.MTG_PLAY_MAT_ICE_SERVERS;
  if (!override) return [];
  try {
    return JSON.parse(override) as IceServer[];
  } catch {
    console.error('[netplay] ignoring malformed MTG_PLAY_MAT_ICE_SERVERS');
    return [];
  }
};

// A board shared with opponents needs about twice the height, and a pod
// of three or four a little more width for the row of opponents. Grow
// each window at most once per step, within the screen, and leave the
// user's own resizes alone.
const DUEL_BOARD_HEIGHT = 1040;
const POD_BOARD_WIDTH = 1800;
const grownBoards = new WeakMap<BrowserWindow, number>();

const growForTable = (board: BrowserWindow | null, opponents: number) => {
  if (!board || board.isDestroyed() || opponents === 0) return;
  const step = opponents > 1 ? 2 : 1;
  if ((grownBoards.get(board) ?? 0) >= step) return;
  grownBoards.set(board, step);
  const bounds = board.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const height = Math.max(
    bounds.height,
    Math.min(DUEL_BOARD_HEIGHT, area.height)
  );
  const width =
    step === 2
      ? Math.max(bounds.width, Math.min(POD_BOARD_WIDTH, area.width))
      : bounds.width;
  if (height === bounds.height && width === bounds.width) return;
  const fit = (pos: number, start: number, room: number, size: number) =>
    Math.max(start, Math.min(pos, start + room - size));
  board.setBounds({
    x: fit(bounds.x, area.x, area.width, width),
    y: fit(bounds.y, area.y, area.height, height),
    width,
    height,
  });
};

type NetplaySetupHandlers = Pick<
  RequestHandlers,
  | 'getNetState'
  | 'netHost'
  | 'netHostLobby'
  | 'netJoinLobby'
  | 'netInvite'
  | 'netAcceptReply'
  | 'netCloseSeat'
  | 'netRoll'
  | 'netJoin'
  | 'netLeave'
  | 'netResend'
  | 'netReport'
  | 'getOpponentView'
  | 'giveControl'
  | 'returnControl'
>;

export const setupNetplay = ({
  profile,
  settings,
  playTest,
  getAppWindow,
  testHooks,
  log,
  mats,
}: {
  profile: ProfileStore;
  settings: SettingsStore;
  playTest: PlayTest;
  getAppWindow(): BrowserWindow | null;
  testHooks: boolean;
  log: DebugLog;
  mats: MatStore;
}) => {
  const config: NetConfig = {
    iceServers: iceServers(testHooks),
    recordWire: testHooks,
  };

  const netWindow = new NetWindow(() => {
    netplay.transportLost();
  }, log.scoped('peer'));

  const relay = new RelayTransport({
    settings: () => relaySettings(settings.settings),
    report: (report) => netplay.handleReport(report),
    log,
  });

  // The share copy is the one the picture's id names, so both ends of
  // the pod agree on what it is called.
  const sharePicture = async (id: string) => {
    if (!id) return null;
    const bytes = await mats.shareBytes(id);
    return bytes ? { id, data: bytes.toString('base64') } : null;
  };

  const keepPicture = (id: string, data: string) =>
    mats.receive(id, Buffer.from(data, 'base64'));

  const netplay: Netplay = new Netplay({
    transports: { p2p: netWindow, relay },
    config,
    appVersion: app.getVersion(),
    profile: () => profile.profile,
    localView: playTest.currentPublicView,
    localFormat: () => playTest.deckFormat,
    pushState: (state) => sendEvent(getAppWindow(), 'netState', state),
    relayReady: () => {
      const { baseUrl, appKey } = relaySettings(settings.settings);
      return baseUrl.trim() !== '' && appKey.trim() !== '';
    },
    log,
    localMat: () => sharePicture(settings.settings.matImage),
    receiveMat: keepPicture,
    // Card backs live in the same store, named the same way.
    localBack: () => sharePicture(settings.settings.cardBack),
    receiveBack: keepPicture,
    receiveControl: playTest.receiveControl,
    peerGone: playTest.peerGone,
    pushOpponent: (state) => {
      growForTable(playTest.boardWindow, state.peers.length);
      sendEvent(playTest.boardWindow, 'opponentView', state);
    },
  });

  playTest.onPublicChange((view) => {
    netplay.localViewChanged(view);
    growForTable(playTest.boardWindow, netplay.opponentCount);
  });

  playTest.onLogEntry(netplay.localLogEntry);

  playTest.linkControl({
    send: netplay.sendControl,
    peerName: netplay.peerName,
  });

  // Peers learn a new name without waiting for a reconnect, whichever
  // window changed it.
  settings.onChange((next, previous) => {
    if (next.displayName !== previous.displayName) netplay.resend();
    if (next.matImage !== previous.matImage) netplay.matChanged();
    if (next.cardBack !== previous.cardBack) netplay.backChanged();
    if (
      next.relayUrl !== previous.relayUrl ||
      next.relayKey !== previous.relayKey
    ) {
      log.scoped('relay').info('the relay settings changed', {
        server: relayHost(relaySettings(next).baseUrl) ?? 'not set',
        key: relaySettings(next).appKey.trim() === '' ? 'not set' : 'set',
      });
      netplay.settingsChanged();
    }
  });

  const handlers: NetplaySetupHandlers = {
    ...netplay.handlers,
    // Only to a player whose game can hold it; renderer input is checked
    // here, since it is untrusted.
    giveControl: (instanceId: unknown, to: unknown) => {
      if (typeof instanceId !== 'string' || typeof to !== 'string') return;
      if (netplay.canTakeControl(to)) playTest.giveControl(instanceId, to);
    },
    returnControl: (instanceId: unknown) => {
      if (typeof instanceId === 'string') playTest.returnControl(instanceId);
    },
  };

  const guards: SenderGuards = { netReport: netWindow.isNetSender };

  return { netplay, netWindow, handlers, guards };
};
