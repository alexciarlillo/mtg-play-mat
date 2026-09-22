import {
  HOST_SEAT,
  MAX_SEATS,
  type PeerInfo,
  type RosterEntry,
} from './protocol';

export type NetRole = 'host' | 'guest';

// How a pod is connected. A lobby code goes through a relay server; peer
// to peer pastes WebRTC codes and involves no server at all.
export type NetMode = 'relay' | 'p2p';

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
  // The connection dropped or the host left; Leave resets.
  | 'ended';

// One guest seat as the host sees it. Each has its own invite and reply.
export type SeatPhase =
  | 'empty'
  | 'creatingInvite'
  | 'awaitingReply'
  | 'connecting'
  // Connected; player stays null until their hello arrives.
  | 'connected';

export interface SeatState {
  seat: number;
  phase: SeatPhase;
  invite: string | null;
  player: PeerInfo | null;
  error: string | null;
}

// The lobby as main sees it; the app window only renders it.
export interface NetState {
  role: NetRole | null;
  // For a host, derived from its seats: connected once anyone is.
  phase: NetPhase;
  // Host only: seats 2 and up.
  seats: SeatState[];
  // Guest only: the reply to send back.
  reply: string | null;
  // Everyone in the pod, this player included, once connected.
  players: RosterEntry[];
  status: string;
  error: string | null;
  // An invite that arrived through a mtgplaymat:// link, not yet used.
  pendingInvite: string | null;
  // Null until a session starts.
  mode: NetMode | null;
  // Relay only: the code to share, once the server has given us one.
  lobbyCode: string | null;
  // A lobby code that arrived through a mtgplaymat:// link.
  pendingLobbyCode: string | null;
}

export const idleNetState: NetState = {
  role: null,
  phase: 'idle',
  seats: [],
  reply: null,
  players: [],
  status: 'Not connected.',
  error: null,
  pendingInvite: null,
  mode: null,
  lobbyCode: null,
  pendingLobbyCode: null,
};

export const guestSeats = Array.from(
  { length: MAX_SEATS - HOST_SEAT },
  (_, i) => HOST_SEAT + 1 + i
);

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

// Main -> net window. The net window owns the peer connections and only
// moves opaque strings; main builds and checks every message. A seat
// names the far end of a link: a guest seat on the host, the host's on a
// guest.
export type NetCommand =
  | { op: 'host'; seat: number; config: NetConfig }
  | { op: 'acceptReply'; seat: number; code: string }
  | { op: 'join'; code: string; config: NetConfig }
  // Relay only: open a lobby, or take a seat in someone else's.
  | { op: 'hostLobby'; slots: number }
  | { op: 'joinLobby'; code: string }
  | { op: 'send'; seats: number[]; data: string }
  | { op: 'close'; seat: number }
  | { op: 'leave' };

// Net window -> main.
export type NetReport =
  | { type: 'invite'; seat: number; code: string }
  // Relay only: the lobby is open, and this is the code to share.
  | { type: 'lobby'; seat: number; code: string }
  // Relay only: the lobby itself failed, not one link inside it.
  | { type: 'lobbyFailed'; seat: number; message: string }
  | { type: 'reply'; seat: number; code: string }
  | { type: 'open'; seat: number }
  | { type: 'message'; seat: number; data: string }
  | { type: 'connection'; seat: number; state: string }
  | { type: 'closed'; seat: number }
  | { type: 'error'; seat: number; message: string };

const MAX_REPORT_TEXT = 512 * 1024;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_REPORT_TEXT;

// The net window is ours, but its input still crosses IPC, so keep only
// well-formed reports.
export const parseNetReport = (input: unknown): NetReport | null => {
  if (typeof input !== 'object' || input === null) return null;
  const fields = input as Record<string, unknown>;
  const { seat } = fields;
  if (
    typeof seat !== 'number' ||
    !Number.isInteger(seat) ||
    seat < HOST_SEAT ||
    seat > MAX_SEATS
  ) {
    return null;
  }
  switch (fields.type) {
    case 'invite':
    case 'reply':
    case 'lobby':
      return isText(fields.code)
        ? { type: fields.type, seat, code: fields.code }
        : null;
    case 'lobbyFailed':
      return isText(fields.message)
        ? { type: 'lobbyFailed', seat, message: fields.message.slice(0, 500) }
        : null;
    case 'message':
      return isText(fields.data)
        ? { type: 'message', seat, data: fields.data }
        : null;
    case 'connection':
      return isText(fields.state)
        ? { type: 'connection', seat, state: fields.state.slice(0, 32) }
        : null;
    case 'error':
      return isText(fields.message)
        ? { type: 'error', seat, message: fields.message.slice(0, 500) }
        : null;
    case 'open':
    case 'closed':
      return { type: fields.type, seat };
    default:
      return null;
  }
};
