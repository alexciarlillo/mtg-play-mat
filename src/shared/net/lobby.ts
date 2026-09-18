import type { PeerInfo } from './protocol';

export type NetRole = 'host' | 'guest';

export type NetPhase =
  | 'idle'
  // Host: gathering routes for the invite, then waiting for the reply.
  | 'creatingInvite'
  | 'awaitingReply'
  // Guest: gathering routes for the reply, then waiting for the host.
  | 'creatingReply'
  | 'awaitingHost'
  | 'connecting'
  | 'connected'
  // The connection dropped or the opponent left; Leave resets.
  | 'ended';

// The lobby as main sees it; the app window only renders it.
export interface NetState {
  role: NetRole | null;
  phase: NetPhase;
  invite: string | null;
  reply: string | null;
  peer: PeerInfo | null;
  status: string;
  error: string | null;
  // An invite that arrived through a mtgplaymat:// link, not yet used.
  pendingInvite: string | null;
}

export const idleNetState: NetState = {
  role: null,
  phase: 'idle',
  invite: null,
  reply: null,
  peer: null,
  status: 'Not connected.',
  error: null,
  pendingInvite: null,
};

export interface Profile {
  // Unique per app session; also the local player's id in the game.
  playerId: string;
  displayName: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface NetConfig {
  iceServers: IceServer[];
  // Test builds keep every outbound message for inspection.
  recordWire: boolean;
}

// Main -> net window. The net window owns the peer connection and only
// moves opaque strings; main builds and checks every message.
export type NetCommand =
  | { op: 'host'; config: NetConfig }
  | { op: 'acceptReply'; code: string }
  | { op: 'join'; code: string; config: NetConfig }
  | { op: 'send'; data: string }
  | { op: 'leave' };

// Net window -> main.
export type NetReport =
  | { type: 'invite'; code: string }
  | { type: 'reply'; code: string }
  | { type: 'open' }
  | { type: 'message'; data: string }
  | { type: 'connection'; state: string }
  | { type: 'closed' }
  | { type: 'error'; message: string };

const MAX_REPORT_TEXT = 512 * 1024;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_REPORT_TEXT;

// The net window is ours, but its input still crosses IPC, so keep only
// well-formed reports.
export const parseNetReport = (input: unknown): NetReport | null => {
  if (typeof input !== 'object' || input === null) return null;
  const fields = input as Record<string, unknown>;
  switch (fields.type) {
    case 'invite':
    case 'reply':
      return isText(fields.code)
        ? { type: fields.type, code: fields.code }
        : null;
    case 'message':
      return isText(fields.data)
        ? { type: 'message', data: fields.data }
        : null;
    case 'connection':
      return isText(fields.state)
        ? { type: 'connection', state: fields.state.slice(0, 32) }
        : null;
    case 'error':
      return isText(fields.message)
        ? { type: 'error', message: fields.message.slice(0, 500) }
        : null;
    case 'open':
    case 'closed':
      return { type: fields.type };
    default:
      return null;
  }
};
