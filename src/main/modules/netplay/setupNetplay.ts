import path from 'node:path';

import type { IceServer, NetConfig } from '@shared/net/lobby';
import { app, BrowserWindow, screen } from 'electron';

import { type RequestHandlers, type SenderGuards, sendEvent } from '../../ipc';
import type PlayTest from '../play-test/PlayTest';
import Netplay from './Netplay';
import NetWindow from './NetWindow';
import ProfileStore from './ProfileStore';

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
  | 'getProfile'
  | 'setDisplayName'
  | 'getNetState'
  | 'netHost'
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

export const createProfileStore = () =>
  new ProfileStore(path.join(app.getPath('userData'), 'settings.json'));

export const setupNetplay = ({
  profile,
  playTest,
  getAppWindow,
  testHooks,
}: {
  profile: ProfileStore;
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

  const netplay: Netplay = new Netplay({
    transport: netWindow,
    config,
    appVersion: app.getVersion(),
    profile: () => profile.profile,
    localView: playTest.currentPublicView,
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

  const handlers: NetplaySetupHandlers = {
    ...netplay.handlers,
    getProfile: () => profile.profile,
    setDisplayName: (name: unknown) => {
      const next = profile.setDisplayName(name);
      // Peers learn the new name without waiting for a reconnect.
      netplay.resend();
      return next;
    },
  };

  const guards: SenderGuards = { netReport: netWindow.isNetSender };

  return { netplay, netWindow, handlers, guards };
};
