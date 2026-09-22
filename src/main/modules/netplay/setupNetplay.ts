import type { IceServer, NetConfig } from '@shared/net/lobby';
import { app, BrowserWindow, screen } from 'electron';

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
>;

export const setupNetplay = ({
  profile,
  settings,
  playTest,
  getAppWindow,
  testHooks,
}: {
  profile: ProfileStore;
  settings: SettingsStore;
  playTest: PlayTest;
  getAppWindow(): BrowserWindow | null;
  testHooks: boolean;
}) => {
  const config: NetConfig = {
    iceServers: iceServers(testHooks),
    recordWire: testHooks,
  };

  const netWindow = new NetWindow(() => {
    netplay.transportLost();
  });

  const relay = new RelayTransport({
    settings: () => relaySettings(settings.settings),
    report: (report) => netplay.handleReport(report),
  });

  const netplay: Netplay = new Netplay({
    transports: { p2p: netWindow, relay },
    config,
    appVersion: app.getVersion(),
    profile: () => profile.profile,
    localView: playTest.currentPublicView,
    localFormat: () => playTest.deckFormat,
    pushState: (state) => sendEvent(getAppWindow(), 'netState', state),
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

  // Peers learn a new name without waiting for a reconnect, whichever
  // window changed it.
  settings.onChange((next, previous) => {
    if (next.displayName !== previous.displayName) netplay.resend();
  });

  const handlers: NetplaySetupHandlers = {
    ...netplay.handlers,
  };

  const guards: SenderGuards = { netReport: netWindow.isNetSender };

  return { netplay, netWindow, handlers, guards };
};
