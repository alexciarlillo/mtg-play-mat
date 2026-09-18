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

// A board shared with an opponent needs about twice the height. Grow it
// once per window, within the screen, and leave later resizes alone.
const DUEL_BOARD_HEIGHT = 1040;
const grownBoards = new WeakSet<BrowserWindow>();

const growForDuel = (board: BrowserWindow | null) => {
  if (!board || board.isDestroyed() || grownBoards.has(board)) return;
  grownBoards.add(board);
  const [width, height] = board.getSize();
  const area = screen.getDisplayMatching(board.getBounds()).workArea;
  const target = Math.min(DUEL_BOARD_HEIGHT, area.height);
  if (height >= target) return;
  const y = Math.max(
    area.y,
    Math.min(board.getBounds().y, area.y + area.height - target)
  );
  board.setBounds({ ...board.getBounds(), y, width, height: target });
};

type NetplaySetupHandlers = Pick<
  RequestHandlers,
  | 'getProfile'
  | 'setDisplayName'
  | 'getNetState'
  | 'netHost'
  | 'netAcceptReply'
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
    netplay.handleReport({ type: 'closed' });
  });

  const netplay: Netplay = new Netplay({
    transport: netWindow,
    config,
    appVersion: app.getVersion(),
    profile: () => profile.profile,
    localView: playTest.currentPublicView,
    pushState: (state) => sendEvent(getAppWindow(), 'netState', state),
    pushOpponent: (state) => {
      if (state.peer) growForDuel(playTest.boardWindow);
      sendEvent(playTest.boardWindow, 'opponentView', state);
    },
  });

  playTest.onPublicChange((view) => {
    netplay.localViewChanged(view);
    if (netplay.netState.peer) growForDuel(playTest.boardWindow);
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
