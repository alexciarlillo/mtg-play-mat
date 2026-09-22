import type { PlayerId } from '@shared/game';
import type { RollResult, RollRequest, TableEvent } from '@shared/net/protocol';
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
