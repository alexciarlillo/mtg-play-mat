import { getPlayer } from './core';
import type { KnownCards } from './knownCards';
import type { LibraryActivity } from './libraryActivity';
import type { ShowingView } from './showing';
import type {
  CardInstance,
  CommanderDamage,
  DummyOpponent,
  CardRef,
  GameState,
  InstanceId,
  Phase,
  PlayerId,
  PlayerState,
  RevealSource,
  ZoneId,
} from './types';

// A card as a view shows it. ref is null when the viewer may not know
// which card it is (a face-down permanent in the public view).
export type CardView = Omit<CardInstance, 'ref'> & { ref: CardRef | null };

export type PublicZoneId = Exclude<ZoneId, 'library' | 'hand'>;

// Peers refuse a view showing more, so nothing may reveal more at once.
export const MAX_REVEALED_CARDS = 100;

// Exactly the hidden cards a player is showing everyone, by identity only.
export interface RevealView {
  source: RevealSource;
  cards: CardRef[];
  // A face-down permanent shown by its owner, or cards found in a search.
  // Older builds drop these and title the reveal as cards from the hand.
  faceDown?: true;
  search?: true;
}

// What every player (and a screenshare) may see of one player. It holds
// no identity of hand or library cards, not even instance ids, beyond
// what the player shows (a reveal, or a top card played revealed).
export interface PublicView {
  seq: number;
  playerId: PlayerId;
  name: string;
  life: number;
  counters: Record<string, number>;
  // Mulligans are public knowledge at a real table.
  mulligans: number;
  keptHand: boolean;
  zones: Record<PublicZoneId, CardView[]>;
  handCount: number;
  libraryCount: number;
  // Commander damage taken, and any stand-in opponents; both public.
  commanderDamage: CommanderDamage[];
  dummies: DummyOpponent[];
  // Optional so views from builds without turns or reveals still fit.
  turn?: number;
  phase?: Phase;
  revealed?: RevealView | null;
  // Present only while the player plays with the top of their library
  // revealed: that card, or null for an empty library.
  topCard?: CardRef | null;
  // Not game state: set while the player has a library dialog open.
  libraryActivity?: LibraryActivity | null;
  // Not game state either: who the player is showing cards to, and how
  // many, but never which.
  showing?: ShowingView | null;
}

// What the player themselves may see: the public view plus their hand.
export interface PrivateView extends PublicView {
  hand: CardView[];
  // The player's own known cards at either end of their library. Added
  // by main, which keeps that knowledge outside the game.
  known?: KnownCards;
}

const publicZones: PublicZoneId[] = [
  'battlefield',
  'graveyard',
  'exile',
  'command',
];

const toView = (card: CardInstance, hideFaceDown: boolean): CardView => ({
  instanceId: card.instanceId,
  ref: hideFaceDown && card.faceDown ? null : card.ref,
  owner: card.owner,
  controller: card.controller,
  zone: card.zone,
  position: card.position ? { ...card.position } : null,
  tapped: card.tapped,
  faceDown: card.faceDown,
  faceIndex: hideFaceDown && card.faceDown ? 0 : card.faceIndex,
  counters: { ...card.counters },
  isToken: card.isToken,
  ...(card.isCommander && {
    isCommander: true,
    commanderCasts: card.commanderCasts ?? 0,
  }),
  attachedTo: card.attachedTo,
});

const copyDamage = (entries: CommanderDamage[] = []) =>
  entries.map((entry) => ({ ...entry }));

const viewCards = (
  state: GameState,
  ids: InstanceId[],
  hideFaceDown: boolean
): CardView[] =>
  ids
    .map((id) => state.cards[id])
    .filter((card): card is CardInstance => card !== undefined)
    .map((card) => toView(card, hideFaceDown));

const zoneViews = (
  state: GameState,
  player: PlayerState,
  hideFaceDown: boolean
) =>
  Object.fromEntries(
    publicZones.map((zone) => [
      zone,
      viewCards(state, player.zones[zone], hideFaceDown),
    ])
  ) as Record<PublicZoneId, CardView[]>;

const isFaceDownHere = (state: GameState, player: PlayerState, id: string) =>
  state.cards[id]?.faceDown === true && player.zones.battlefield.includes(id);

// Only cards still where they were revealed from are shown. A single
// card may also be one of the player's face-down permanents.
const revealView = (
  state: GameState,
  player: PlayerState
): RevealView | null => {
  const reveal = player.revealed;
  if (!reveal) return null;
  if (reveal.search) {
    const hidden = new Set([...player.zones.hand, ...player.zones.library]);
    const found = reveal.instanceIds
      .filter((id) => hidden.has(id))
      .map((id) => state.cards[id].ref);
    return found.length > 0
      ? { source: reveal.source, cards: found, search: true }
      : null;
  }
  const from: ZoneId = reveal.source === 'libraryTop' ? 'library' : 'hand';
  const faceDown =
    reveal.source === 'card' &&
    reveal.instanceIds.some((id) => isFaceDownHere(state, player, id));
  const cards = reveal.instanceIds
    .filter((id) =>
      faceDown
        ? isFaceDownHere(state, player, id)
        : player.zones[from].includes(id)
    )
    .map((id) => state.cards[id].ref);
  if (cards.length === 0) return null;
  return { source: reveal.source, cards, ...(faceDown && { faceDown: true }) };
};

const topCardOf = (state: GameState, player: PlayerState): CardRef | null => {
  const top = player.zones.library[0];
  return top === undefined ? null : (state.cards[top]?.ref ?? null);
};

export const publicView = (
  state: GameState,
  playerId: PlayerId
): PublicView | null => {
  const player = getPlayer(state, playerId);
  if (!player) return null;

  return {
    seq: state.seq,
    playerId: player.id,
    name: player.name,
    life: player.life,
    counters: { ...player.counters },
    mulligans: player.mulligans,
    keptHand: player.keptHand,
    zones: zoneViews(state, player, true),
    handCount: player.zones.hand.length,
    libraryCount: player.zones.library.length,
    commanderDamage: copyDamage(player.commanderDamage),
    dummies: (player.dummies ?? []).map((dummy) => ({
      ...dummy,
      commanderDamage: copyDamage(dummy.commanderDamage),
    })),
    turn: player.turn,
    phase: player.phase,
    revealed: revealView(state, player),
    ...(player.topRevealed && { topCard: topCardOf(state, player) }),
  };
};

export const privateView = (
  state: GameState,
  playerId: PlayerId
): PrivateView | null => {
  const view = publicView(state, playerId);
  const player = getPlayer(state, playerId);
  if (!view || !player) return null;

  return {
    ...view,
    // The owner still sees the fronts of their face-down permanents.
    zones: zoneViews(state, player, false),
    hand: viewCards(state, player.zones.hand, false),
  };
};

// The library, top first, for its owner's private tools (looking at the
// top cards, searching). Never part of any pushed view.
export const libraryView = (
  state: GameState,
  playerId: PlayerId
): CardView[] | null => {
  const player = getPlayer(state, playerId);
  return player ? viewCards(state, player.zones.library, false) : null;
};
