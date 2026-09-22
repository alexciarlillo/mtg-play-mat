import type { PlayerId, PublicView } from '../game';
import {
  namespaceView,
  type NetMessage,
  type PeerInfo,
  type RosterEntry,
  type TableEvent,
} from './protocol';

export interface RemotePeer {
  info: PeerInfo;
  // From the roster; null until the host has placed them.
  seat: number | null;
  view: PublicView | null;
  // Their play area background, once its bytes are on this machine.
  matId: string | null;
}

// What the board shows of the other players. seq increases with every
// change so a window can order a fetched snapshot against pushed ones.
export type TableEntry =
  | {
      kind: 'action';
      // Unique within this table's history, for keys.
      id: number;
      // When this machine learned of it; peers' clocks aren't trusted.
      at: number;
      playerId: PlayerId;
      playerName: string;
      text: string;
    }
  | { kind: 'roll'; id: number; at: number; event: TableEvent };

export interface OpponentState {
  seq: number;
  selfSeat: number | null;
  // In seat order.
  peers: RemotePeer[];
  // Every player's actions and every roll, in the order they arrived
  // here; newest last.
  log: TableEntry[];
}

interface Peer {
  info: PeerInfo;
  lastSeq: number;
  view: PublicView | null;
  matId: string | null;
}

export const MAX_LOG = 500;

const bySeat = (a: RemotePeer, b: RemotePeer) =>
  (a.seat ?? Infinity) - (b.seat ?? Infinity) ||
  a.info.name.localeCompare(b.info.name);

// The latest public view of every other player, keyed by player id. They
// are only ever shown next to the local game, never merged into it.
export class RemoteViews {
  private peers = new Map<PlayerId, Peer>();

  private seats = new Map<PlayerId, number>();

  private log: TableEntry[] = [];

  private entryId = 0;

  private rev = 0;

  constructor(
    private readonly selfId: () => PlayerId,
    private readonly now: () => number = Date.now
  ) {}

  // Returns whether the opponent state changed. Each sender is checked on
  // its own: a relayed message is judged exactly like a direct one.
  receive = (message: NetMessage): boolean => {
    if (message.from === this.selfId()) return false;
    if (message.kind === 'hello') {
      const { playerId, name, appVersion, features } = message;
      // A repeated hello (a resend) keeps what is already on the board.
      const known = this.peers.get(playerId);
      this.peers.set(playerId, {
        info: { playerId, name, appVersion, ...(features && { features }) },
        lastSeq: message.seq,
        view: known?.view ?? null,
        matId: known?.matId ?? null,
      });
      return this.changed();
    }
    if (
      message.kind !== 'public' &&
      message.kind !== 'bye' &&
      message.kind !== 'log'
    ) {
      return false;
    }

    const peer = this.peers.get(message.from);
    if (!peer || message.seq <= peer.lastSeq) return false;
    peer.lastSeq = message.seq;

    if (message.kind === 'bye') {
      this.peers.delete(message.from);
      return this.changed();
    }
    if (message.kind === 'log') {
      this.addAction(peer.info.playerId, peer.info.name, message.text);
      return true;
    }
    peer.view = message.view && namespaceView(message.view, message.from);
    return this.changed();
  };

  // Seats come from the host's roster; anyone missing from it has left.
  // Returns the players that were dropped.
  setRoster = (roster: RosterEntry[]): PeerInfo[] => {
    const listed = new Set(roster.map((entry) => entry.playerId));
    const dropped = [...this.peers.values()]
      .filter((peer) => !listed.has(peer.info.playerId))
      .map((peer) => peer.info);
    dropped.forEach((info) => this.peers.delete(info.playerId));
    this.seats = new Map(roster.map((entry) => [entry.playerId, entry.seat]));
    this.changed();
    return dropped;
  };

  // A peer's play area background, once main has its bytes on disk.
  // Mats arrive on an ordered link and are checked against their own
  // hash, so they need no sequence of their own.
  setMat = (playerId: PlayerId, matId: string | null): boolean => {
    const peer = this.peers.get(playerId);
    if (!peer || peer.matId === matId) return false;
    peer.matId = matId;
    return this.changed();
  };

  remove = (playerId: PlayerId): boolean =>
    this.peers.delete(playerId) && this.changed();

  addEvent = (event: TableEvent) => {
    this.append({ kind: 'roll', id: this.nextId(), at: this.now(), event });
  };

  // A line of the local player's log, or one a peer sent.
  addAction = (playerId: PlayerId, playerName: string, text: string) => {
    this.append({
      kind: 'action',
      id: this.nextId(),
      at: this.now(),
      playerId,
      playerName,
      text,
    });
  };

  // The log is the table's history, so it outlasts the players: leaving
  // or starting a new session keeps it.
  clear = (): boolean => {
    if (this.peers.size === 0 && this.seats.size === 0) return false;
    this.peers.clear();
    this.seats.clear();
    return this.changed();
  };

  peer = (playerId: PlayerId): PeerInfo | null =>
    this.peers.get(playerId)?.info ?? null;

  get connectedPeers(): PeerInfo[] {
    return this.snapshot().peers.map((peer) => peer.info);
  }

  snapshot = (): OpponentState => ({
    seq: this.rev,
    selfSeat: this.seats.get(this.selfId()) ?? null,
    peers: [...this.peers.values()]
      .map((peer) => ({
        info: peer.info,
        seat: this.seats.get(peer.info.playerId) ?? null,
        view: peer.view,
        matId: peer.matId,
      }))
      .sort(bySeat),
    log: this.log,
  });

  private nextId = () => {
    this.entryId += 1;
    return this.entryId;
  };

  private append = (entry: TableEntry) => {
    this.log = [...this.log, entry].slice(-MAX_LOG);
    this.changed();
  };

  private changed = () => {
    this.rev += 1;
    return true;
  };
}
