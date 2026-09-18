import { getPlayer } from './core';
import type {
  CardInstance,
  CardRef,
  GameState,
  InstanceId,
  PlayerId,
  PlayerState,
  ZoneId,
} from './types';

// A card as a view shows it. ref is null when the viewer may not know
// which card it is (a face-down permanent in the public view).
export type CardView = Omit<CardInstance, 'ref'> & { ref: CardRef | null };

export type PublicZoneId = Exclude<ZoneId, 'library' | 'hand'>;

// What every player (and a screenshare) may see of one player. It holds
// no identity of hand or library cards, not even instance ids.
export interface PublicView {
  seq: number;
  playerId: PlayerId;
  name: string;
  life: number;
  counters: Record<string, number>;
  zones: Record<PublicZoneId, CardView[]>;
  handCount: number;
  libraryCount: number;
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
});

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
    zones: zoneViews(state, player, true),
    handCount: player.zones.hand.length,
    libraryCount: player.zones.library.length,
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
