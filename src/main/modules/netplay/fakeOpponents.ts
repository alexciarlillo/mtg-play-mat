import {
  emptyGame,
  type GameAction,
  type GameState,
  getPlayer,
  type InstanceId,
  OPENING_HAND_SIZE,
  type PlayerId,
  publicView,
  reduce,
  startingLife,
} from '@shared/game';
import { guestSeats } from '@shared/net/lobby';
import { namespaceView, type PeerInfo } from '@shared/net/protocol';
import type { RemotePeer } from '@shared/net/remoteViews';

import buildSampleDeck from '../play-test/sampleDeck';

interface FakePlayer {
  playerId: PlayerId;
  name: string;
}

// One per guest seat, so a full pod can be filled. The ids are fixed so
// the same seat is the same player from run to run.
const fakePlayers: FakePlayer[] = [
  { playerId: 'fake-mira', name: 'Mira Castellan' },
  { playerId: 'fake-desmond', name: 'Desmond Okafor' },
  { playerId: 'fake-yuki', name: 'Yuki Tanaka' },
];

export const MAX_FAKE_PEERS = fakePlayers.length;

// Enough to fill a board without emptying the hand.
const PERMANENTS_PLAYED = 5;

const TAPPED_PERMANENTS = 2;

const TURNS_PLAYED = 2;

// Nothing on the wire carries this, so it only has to be recognisable
// if it ever surfaces in a peer list.
const FAKE_APP_VERSION = '0.0.0-fake';

// Odd multiplier so neighbouring seats get unrelated shuffles rather
// than ones a card or two apart.
const seatSeed = (seed: number, index: number) =>
  (Math.floor(seed) + index * 0x9e3779b1) >>> 0;

const isPermanent = (state: GameState, id: InstanceId) => {
  const typeLine = state.cards[id]?.ref.typeLine ?? '';
  return typeLine.includes('Land') || typeLine.includes('Creature');
};

const handPermanents = (state: GameState, playerId: PlayerId): InstanceId[] =>
  (getPlayer(state, playerId)?.zones.hand ?? []).filter((id) =>
    isPermanent(state, id)
  );

// Dealt and played through the real reducer so the resulting view is the
// one a live peer would send.
const dealtGame = (
  playerId: PlayerId,
  name: string,
  seed: number
): GameState => {
  const library = buildSampleDeck();
  const leader = library.find((ref) => ref.name === 'Colossal Dreadmaw');
  const opening: GameAction[] = [
    {
      type: 'newGame',
      seed,
      players: [
        {
          id: playerId,
          name,
          deck: library,
          command: leader ? [leader] : [],
          life: startingLife('commander'),
        },
      ],
    },
    { type: 'shuffle', playerId },
    { type: 'draw', playerId, count: OPENING_HAND_SIZE },
    { type: 'keepHand', playerId, bottom: [] },
    ...Array.from({ length: TURNS_PLAYED }, (): GameAction => ({
      type: 'nextTurn',
      playerId,
      untap: true,
      draw: true,
    })),
  ];
  const kept = opening.reduce(reduce, emptyGame());

  const played = handPermanents(kept, playerId).slice(0, PERMANENTS_PLAYED);
  const board: GameAction[] = [
    ...played.map((instanceId): GameAction => ({
      type: 'moveCard',
      instanceId,
      to: 'battlefield',
    })),
    ...played.slice(0, TAPPED_PERMANENTS).map((instanceId): GameAction => ({
      type: 'tap',
      instanceId,
    })),
    { type: 'setPhase', playerId, phase: 'main1' },
  ];
  return board.reduce(reduce, kept);
};

const fakePeer = (index: number, seed: number): RemotePeer => {
  const { playerId, name } = fakePlayers[index];
  const state = dealtGame(playerId, name, seatSeed(seed, index));
  const view = publicView(state, playerId);
  const info: PeerInfo = { playerId, name, appVersion: FAKE_APP_VERSION };
  return {
    info,
    // Guest seats, because the local player always holds the host seat.
    seat: guestSeats[index],
    // Namespaced the way a received view is, so instance ids can never
    // collide with the local game's.
    view: view && namespaceView(view, playerId),
  };
};

// Counts are clamped to 0..MAX_FAKE_PEERS and truncated, so anything
// below 1 (or not a number) yields no peers and anything above the pod
// size yields a full pod.
const seatCount = (count: number) => {
  const whole = Math.floor(count);
  return Number.isFinite(whole)
    ? Math.max(0, Math.min(MAX_FAKE_PEERS, whole))
    : 0;
};

// Synthetic opponents for testing pod layouts. The same seed and count
// always give the same peers; each seat gets its own shuffle.
export const fakePeers = (count: number, seed: number): RemotePeer[] =>
  Array.from({ length: seatCount(count) }, (_, index) => fakePeer(index, seed));
