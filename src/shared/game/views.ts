import { getPlayer } from './core';
import type { LibraryActivity } from './libraryActivity';
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

// Exactly the hidden cards a player is showing everyone, by identity only.
export interface RevealView {
  source: RevealSource;
  cards: CardRef[];
}

// What every player (and a screenshare) may see of one player. It holds
// no identity of hand or library cards, not even instance ids.
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
  // Not game state: set while the player has a library dialog open.
  libraryActivity?: LibraryActivity | null;
}

// What the player themselves may see: the public view plus their hand.
export interface PrivateView extends PublicView {
  hand: CardView[];
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

// Only cards still where they were revealed from are shown.
const revealView = (
  state: GameState,
  player: PlayerState
): RevealView | null => {
  const reveal = player.revealed;
  if (!reveal) return null;
  const from: ZoneId = reveal.source === 'libraryTop' ? 'library' : 'hand';
  const cards = reveal.instanceIds
    .filter((id) => player.zones[from].includes(id))
    .map((id) => state.cards[id].ref);
  return cards.length > 0 ? { source: reveal.source, cards } : null;
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
