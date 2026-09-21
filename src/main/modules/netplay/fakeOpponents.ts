import {
  emptyGame,
  type GameAction,
  type GameState,
  getPlayer,
  type InstanceId,
  nextRandom,
  OPENING_HAND_SIZE,
  type PlayerId,
  type Position,
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

// A mid-game board: two rows of permanents with cards still in hand.
const LANDS_PLAYED = 5;

const CREATURES_PLAYED = 4;

// Lands pay for the spells, so those are the ones left tapped.
const TAPPED_LANDS = 3;

const TURNS_PLAYED = 5;

// The battlefield's logical geometry. It belongs to the renderer's board
// layout, which main must not import, so the numbers are restated here.
const FIELD_HEIGHT = 640;
const FIELD_WIDTH = 640;
const CARD_EXTENT = 230;

// Creatures in front of the lands, both rows clear of the field's edges.
const CREATURE_ROW_Y = 40;
const LAND_ROW_Y = FIELD_HEIGHT - CARD_EXTENT - 50;

// How far a card may sit off its row, so a board reads as hand-placed
// rather than as a grid.
const JITTER = 18;

// Nothing on the wire carries this, so it only has to be recognisable
// if it ever surfaces in a peer list.
const FAKE_APP_VERSION = '0.0.0-fake';

// Odd multiplier so neighbouring seats get unrelated shuffles rather
// than ones a card or two apart.
const seatSeed = (seed: number, index: number) =>
  (Math.floor(seed) + index * 0x9e3779b1) >>> 0;

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

// Salted so the two axes of a card, and neighbouring cards, get
// unrelated offsets rather than the same one.
const jitter = (seed: number, index: number, axis: number) => {
  const salt = (seed + index * 0x85ebca6b + axis * 0xc2b2ae35) >>> 0;
  return (nextRandom(salt)[0] - 0.5) * JITTER;
};

// A row spread across the field, wide enough that a full row of lands
// only overlaps the way a real player's fanned-out row does.
const rowPositions = (count: number, y: number, seed: number): Position[] => {
  const span = FIELD_WIDTH - CARD_EXTENT;
  const step = count > 1 ? span / (count - 1) : 0;
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(clamp(index * step + jitter(seed, index, 0), span)),
    y: Math.round(
      clamp(y + jitter(seed, index, 1), FIELD_HEIGHT - CARD_EXTENT)
    ),
  }));
};

const handMatching = (
  state: GameState,
  playerId: PlayerId,
  match: (typeLine: string) => boolean
): InstanceId[] =>
  (getPlayer(state, playerId)?.zones.hand ?? []).filter((id) =>
    match(state.cards[id]?.ref.typeLine ?? '')
  );

// Dealt and played through the real reducer so the resulting view is the
// one a live peer would send.
const dealtGame = (
  playerId: PlayerId,
  name: string,
  seed: number,
  life: number
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
          life,
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

  const lands = handMatching(kept, playerId, (type) =>
    type.includes('Land')
  ).slice(0, LANDS_PLAYED);
  const creatures = handMatching(
    kept,
    playerId,
    (type) => type.includes('Creature') && !type.includes('Land')
  ).slice(0, CREATURES_PLAYED);
  // Placed deliberately rather than left to the engine's cascade, which
  // would pile a seat's whole board into one overlapping corner stack.
  const creatureRow = rowPositions(creatures.length, CREATURE_ROW_Y, seed);
  const landRow = rowPositions(lands.length, LAND_ROW_Y, seed + 1);
  const played: [InstanceId, Position][] = [
    ...creatures.map((id, i): [InstanceId, Position] => [id, creatureRow[i]]),
    ...lands.map((id, i): [InstanceId, Position] => [id, landRow[i]]),
  ];

  const board: GameAction[] = [
    ...played.map(([instanceId, position]): GameAction => ({
      type: 'moveCard',
      instanceId,
      to: 'battlefield',
      position,
    })),
    ...lands.slice(0, TAPPED_LANDS).map((instanceId): GameAction => ({
      type: 'tap',
      instanceId,
    })),
    { type: 'setPhase', playerId, phase: 'main1' },
  ];
  return board.reduce(reduce, kept);
};

const fakePeer = (index: number, seed: number, life: number): RemotePeer => {
  const { playerId, name } = fakePlayers[index];
  const state = dealtGame(playerId, name, seatSeed(seed, index), life);
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

// Synthetic opponents for testing pod layouts. The same seed, count and
// life always give the same peers; each seat gets its own shuffle. Life
// defaults to constructed's, the format a sample play test runs.
export const fakePeers = (
  count: number,
  seed: number,
  life: number = startingLife('constructed')
): RemotePeer[] =>
  Array.from({ length: seatCount(count) }, (_, index) =>
    fakePeer(index, seed, life)
  );
