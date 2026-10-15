import { describeShowingSource, type ShowingSource } from './showing';
import type { CardRef, PlayerId } from './types';
import type { PublicView, RevealView } from './views';

// How another player's cards were seen: one of the reveal sources, or a
// top card they play with revealed.
export type SeenSource = ShowingSource | 'topCard';

// Cards another player showed during this game, kept after the reveal
// ends. A reveal to everyone is public; one to this player alone stays
// in the window that shows the hand.
export interface SeenEntry {
  // Unique on this machine, for keys.
  id: number;
  player: PlayerId;
  playerName: string;
  to: 'everyone' | 'you';
  source: SeenSource;
  cards: CardRef[];
  // When this machine saw it.
  at: number;
}

// The words after the player's name, e.g. "revealed their hand (3
// cards)" or "showed you the top card of their library".
export const describeSeen = (entry: SeenEntry): string => {
  if (entry.source === 'topCard') return 'had on top of their library';
  const what = describeShowingSource(entry.source, entry.cards.length);
  return entry.to === 'you' ? `showed you ${what}` : `revealed ${what}`;
};

// A reveal to everyone, in the words a reveal to one player uses.
const sourceOf = (reveal: RevealView): ShowingSource => {
  if (reveal.faceDown) return 'faceDown';
  if (reveal.search) return 'search';
  return reveal.source;
};

const cardKey = (ref: CardRef) => `${ref.id}\u0000${ref.name}`;

const isPrefix = (short: CardRef[], long: CardRef[]) =>
  short.every((ref, i) => long[i] && cardKey(long[i]) === cardKey(ref));

// Whether every card in part is one of whole, counting copies.
const isPart = (part: CardRef[], whole: CardRef[]) => {
  const left = new Map<string, number>();
  whole.forEach((ref) => {
    const key = cardKey(ref);
    left.set(key, (left.get(key) ?? 0) + 1);
  });
  return part.every((ref) => {
    const key = cardKey(ref);
    const n = left.get(key) ?? 0;
    left.set(key, n - 1);
    return n > 0;
  });
};

// What is showing right now for one player, to tell a reveal that lasts
// across several views from a new one.
interface Live {
  reveal: { entryId: number; source: ShowingSource } | null;
  top: string | null;
}

export interface SeenPeer {
  playerId: PlayerId;
  name: string;
  view: PublicView | null;
}

export const MAX_SEEN = 200;

// The receiver's "seen this game" list, built from other players' views
// and the reveals sent to this player alone.
export class SeenList {
  private table: SeenEntry[] = [];

  private shown: SeenEntry[] = [];

  private live = new Map<PlayerId, Live>();

  private shownIds = new Set<string>();

  private nextId = 0;

  constructor(private readonly now: () => number = Date.now) {}

  // Seen by the whole table: safe for the board.
  get everyone(): SeenEntry[] {
    return this.table;
  }

  // Shown to this player alone.
  get you(): SeenEntry[] {
    return this.shown;
  }

  // Returns whether the public list changed.
  notePeers = (peers: SeenPeer[]): boolean => {
    const before = this.table;
    const here = new Set(peers.map((peer) => peer.playerId));
    [...this.live.keys()].forEach((id) => {
      if (!here.has(id)) this.live.delete(id);
    });
    peers.forEach((peer) => this.notePeer(peer));
    return this.table !== before;
  };

  // Returns whether the private list changed. A reveal is listed once,
  // however often it is sent.
  noteShown = (
    from: PlayerId,
    fromName: string,
    reveal: { id: number; source: ShowingSource; cards: CardRef[] }
  ): boolean => {
    const key = `${from}:${reveal.id}`;
    if (this.shownIds.has(key) || reveal.cards.length === 0) return false;
    this.shownIds.add(key);
    // A Set iterates oldest first, so this drops the oldest key.
    if (this.shownIds.size > MAX_SEEN) {
      this.shownIds.delete(this.shownIds.values().next().value!);
    }
    this.shown = this.add(this.shown, {
      player: from,
      playerName: fromName,
      to: 'you',
      source: reveal.source,
      cards: reveal.cards,
    });
    return true;
  };

  // Returns whether there was anything to clear.
  clear = (): boolean => {
    const had = this.table.length > 0 || this.shown.length > 0;
    this.table = [];
    this.shown = [];
    this.live.clear();
    this.shownIds.clear();
    return had;
  };

  private notePeer = ({ playerId, name, view }: SeenPeer) => {
    const live = this.live.get(playerId) ?? { reveal: null, top: null };
    const reveal = view?.revealed ?? null;
    if (!reveal || reveal.cards.length === 0) {
      live.reveal = null;
    } else {
      live.reveal = this.noteReveal(playerId, name, live.reveal, reveal);
    }
    // Without a view (a game reopening), the last top card still holds.
    if (!view) {
      this.live.set(playerId, live);
      return;
    }
    const top = view.topCard ?? null;
    const topKey = top && cardKey(top);
    if (top && topKey !== live.top) {
      this.table = this.add(this.table, {
        player: playerId,
        playerName: name,
        to: 'everyone',
        source: 'topCard',
        cards: [top],
      });
    }
    live.top = topKey;
    this.live.set(playerId, live);
  };

  // A reveal still up is the same reveal while it only grows (revealing
  // one card more) or shrinks (a revealed card was played).
  private noteReveal = (
    player: PlayerId,
    playerName: string,
    was: Live['reveal'],
    reveal: RevealView
  ): Live['reveal'] => {
    const source = sourceOf(reveal);
    const entry =
      was && was.source === source
        ? this.table.find((e) => e.id === was.entryId)
        : undefined;
    if (entry && isPart(reveal.cards, entry.cards)) return was;
    if (entry && isPrefix(entry.cards, reveal.cards)) {
      this.table = this.table.map((e) =>
        e === entry ? { ...e, cards: reveal.cards } : e
      );
      return was;
    }
    this.table = this.add(this.table, {
      player,
      playerName,
      to: 'everyone',
      source,
      cards: reveal.cards,
    });
    return { entryId: this.nextId, source };
  };

  private add = (
    list: SeenEntry[],
    entry: Omit<SeenEntry, 'id' | 'at'>
  ): SeenEntry[] => {
    this.nextId += 1;
    return [...list, { ...entry, id: this.nextId, at: this.now() }].slice(
      -MAX_SEEN
    );
  };
}
