import type { PublicView } from '../game';
import { namespaceView, type NetMessage, type PeerInfo } from './protocol';

// What the board shows of the other side. seq increases with every change
// so a window can order a fetched snapshot against pushed ones.
export interface OpponentState {
  seq: number;
  peer: PeerInfo | null;
  view: PublicView | null;
}

interface Peer {
  info: PeerInfo;
  lastSeq: number;
  view: PublicView | null;
}

// The latest public view of the connected peer. It is only ever shown
// next to the local game, never merged into it.
export class RemoteViews {
  private peer: Peer | null = null;

  private rev = 0;

  // Returns whether the opponent state changed.
  receive = (message: NetMessage): boolean => {
    if (message.kind === 'hello') {
      const { playerId, name, appVersion } = message;
      // A repeated hello (a resend) keeps what is already on the board.
      const same = this.peer?.info.playerId === playerId;
      this.peer = {
        info: { playerId, name, appVersion },
        lastSeq: message.seq,
        view: same ? (this.peer?.view ?? null) : null,
      };
      return this.changed();
    }

    const peer = this.peer;
    if (!peer || message.from !== peer.info.playerId) return false;
    if (message.seq <= peer.lastSeq) return false;
    peer.lastSeq = message.seq;

    if (message.kind === 'bye') {
      this.peer = null;
      return this.changed();
    }

    peer.view = message.view && namespaceView(message.view, message.from);
    return this.changed();
  };

  clear = (): boolean => {
    if (!this.peer) return false;
    this.peer = null;
    return this.changed();
  };

  get connectedPeer(): PeerInfo | null {
    return this.peer?.info ?? null;
  }

  snapshot = (): OpponentState => ({
    seq: this.rev,
    peer: this.peer?.info ?? null,
    view: this.peer?.view ?? null,
  });

  private changed = () => {
    this.rev += 1;
    return true;
  };
}
