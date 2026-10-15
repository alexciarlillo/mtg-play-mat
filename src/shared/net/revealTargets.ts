import type { PlayerId } from '../game';
import { FEATURE_REVEAL, hasFeature } from './protocol';
import type { RemotePeer } from './remoteViews';

// A player cards can be shown to. One who can't take them yet is still
// listed, greyed out, with the reason.
export interface RevealTarget {
  playerId: PlayerId;
  name: string;
  ready: boolean;
  why?: string;
}

// A guest's reveal to another guest goes by the host, so a host on an
// older build (oldHost) would drop it; only the host itself can be shown.
export const revealTargets = (
  peers: RemotePeer[],
  oldHost?: PlayerId
): RevealTarget[] =>
  peers.map(({ info, view }) => {
    const target = { playerId: info.playerId, name: info.name };
    if (!view) return { ...target, ready: false, why: 'no game open' };
    if (!hasFeature(info, FEATURE_REVEAL)) {
      return { ...target, ready: false, why: 'needs a newer version' };
    }
    if (oldHost !== undefined && info.playerId !== oldHost) {
      return { ...target, ready: false, why: 'the host needs a newer version' };
    }
    return { ...target, ready: true };
  });

export const sameRevealTargets = (a: RevealTarget[], b: RevealTarget[]) =>
  a.length === b.length &&
  a.every(
    (target, i) =>
      target.playerId === b[i].playerId &&
      target.name === b[i].name &&
      target.ready === b[i].ready &&
      target.why === b[i].why
  );
