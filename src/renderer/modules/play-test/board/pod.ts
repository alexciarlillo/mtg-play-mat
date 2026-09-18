import type { RollRequest, TableEvent } from '@shared/net/protocol';
import type { RemotePeer } from '@shared/net/remoteViews';

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

export const describeEvent = ({ byName, roll }: TableEvent) =>
  roll.type === 'coin'
    ? `${byName} flipped a coin: ${roll.result}`
    : `${byName} rolled a d${roll.sides}: ${roll.result}`;

export const requestRoll = (request: RollRequest) => {
  window.api.netRoll(request).catch((err: unknown) => {
    console.error('[play-test] roll failed', err);
  });
};
