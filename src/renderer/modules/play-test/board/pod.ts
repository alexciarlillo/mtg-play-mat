import type { CardView, PlayerId } from '@shared/game';
import {
  FEATURE_CONTROL,
  hasFeature,
  type RollRequest,
  type RollResult,
  type TableEvent,
} from '@shared/net/protocol';
import type { RemotePeer, TableEntry } from '@shared/net/remoteViews';

import {
  commanderSources,
  type DamageSource,
  visibleCommanders,
} from './commanders';

// Opponents in turn order: the seats after this player's come first, so
// the next player to act is always leftmost.
export const seatOrder = (
  peers: RemotePeer[],
  selfSeat: number | null
): RemotePeer[] => {
  if (selfSeat === null) return peers;
  const after = (peer: RemotePeer) =>
    peer.seat === null ? Infinity : (peer.seat - selfSeat + 8) % 8;
  return [...peers].sort((a, b) => after(a) - after(b));
};

// Every commander this player can take damage from. With several
// opponents each is labelled with its owner, since two may share a name.
export const opponentCommanders = (peers: RemotePeer[]): DamageSource[] =>
  peers.flatMap(({ info, view }) =>
    view
      ? commanderSources(visibleCommanders(view)).map((source) =>
          peers.length > 1
            ? { ...source, name: `${source.name} (${info.name})` }
            : source
        )
      : []
  );

export interface ControlTarget {
  playerId: PlayerId;
  name: string;
}

// Who a permanent can be handed to: players with a game open, on a
// build that knows how to hold it.
export const controlTargets = (peers: RemotePeer[]): ControlTarget[] =>
  peers
    .filter((peer) => peer.view && hasFeature(peer.info, FEATURE_CONTROL))
    .map(({ info }) => ({ playerId: info.playerId, name: info.name }));

export type OwnerLabels = Record<PlayerId, string>;

// How a permanent's owner is named on a board, the local player's own
// permanents included.
export const ownerLabels = (
  peers: RemotePeer[],
  selfId: PlayerId | undefined
): OwnerLabels => ({
  ...Object.fromEntries(
    peers.map(({ info }) => [info.playerId, `${info.name}'s`])
  ),
  ...(selfId && { [selfId]: 'Yours' }),
});

// Only a permanent under someone other than its owner is labelled.
export const ownerLabel = (
  card: CardView,
  controller: PlayerId,
  labels: OwnerLabels
): string | null =>
  card.owner === controller ? null : (labels[card.owner] ?? "Another player's");

// What was rolled, without saying by whom: a seat's own log is already
// under their name.
export const describeRoll = (roll: RollResult) =>
  roll.type === 'coin'
    ? `flipped a coin: ${roll.result}`
    : `rolled a d${roll.sides}: ${roll.result}`;

export const describeEvent = ({ byName, roll }: TableEvent) =>
  `${byName} ${describeRoll(roll)}`;

// One player's part of the table history, newest first. Rolls count as
// theirs when they were the one who asked for them.
export const entriesFor = (
  log: TableEntry[],
  playerId: PlayerId
): TableEntry[] =>
  log
    .filter((entry) =>
      entry.kind === 'roll'
        ? entry.event.by === playerId
        : entry.playerId === playerId
    )
    .reverse();

export const requestRoll = (request: RollRequest) => {
  window.api.netRoll(request).catch((err: unknown) => {
    console.error('[play-test] roll failed', err);
  });
};
