import { describe, expect, it } from 'vitest';

import { fakePeers, MAX_FAKE_PEERS } from './fakeOpponents';

const counts = [1, 2, 3];

describe('fakePeers', () => {
  it.each(counts)('returns %i well-formed peers', (count) => {
    const peers = fakePeers(count, 7);

    expect(peers).toHaveLength(count);
    peers.forEach((peer) => {
      expect(peer.info.playerId).toBeTruthy();
      expect(peer.info.name).toBeTruthy();
      expect(peer.info.appVersion).toBeTruthy();
      expect(peer.seat).toEqual(expect.any(Number));
      expect(peer.view).not.toBeNull();
    });
  });

  it('gives every peer its own id, name, and seat', () => {
    const peers = fakePeers(MAX_FAKE_PEERS, 7);
    const field = <T>(pick: (peer: (typeof peers)[number]) => T) =>
      new Set(peers.map(pick));

    expect(field((peer) => peer.info.playerId).size).toBe(MAX_FAKE_PEERS);
    expect(field((peer) => peer.info.name).size).toBe(MAX_FAKE_PEERS);
    expect(field((peer) => peer.seat).size).toBe(MAX_FAKE_PEERS);
  });

  it('populates every key the board reads off a public view', () => {
    const [peer] = fakePeers(1, 7);
    const view = peer.view!;

    expect(view.playerId).toBe(peer.info.playerId);
    expect(view.name).toBe(peer.info.name);
    expect(view.life).toBeGreaterThan(0);
    expect(view.keptHand).toBe(true);
    expect(view.handCount).toBeGreaterThan(0);
    expect(view.libraryCount).toBeGreaterThan(0);
    expect(view.zones.battlefield.length).toBeGreaterThan(0);
    expect(view.zones.command.length).toBeGreaterThan(0);
    expect(view.zones.battlefield.some((card) => card.tapped)).toBe(true);
    expect(view.turn).toBeGreaterThan(1);
    expect(view.phase).toBe('main1');
    expect(view.commanderDamage).toEqual([]);
    expect(view.dummies).toEqual([]);
    expect(view.revealed).toBeNull();
  });

  it('namespaces instance ids with the peer that owns them', () => {
    const [peer] = fakePeers(1, 7);

    peer.view!.zones.battlefield.forEach((card) => {
      expect(card.instanceId.startsWith(`${peer.info.playerId}/`)).toBe(true);
    });
  });

  it('gives each seat a different board', () => {
    const [first, second] = fakePeers(2, 7);

    expect(first.view!.zones.battlefield).not.toEqual(
      second.view!.zones.battlefield
    );
  });

  it('is deterministic for the same seed', () => {
    expect(fakePeers(3, 7)).toEqual(fakePeers(3, 7));
  });

  it('deals differently for a different seed', () => {
    expect(fakePeers(3, 7)).not.toEqual(fakePeers(3, 8));
  });

  it('clamps counts outside the supported range', () => {
    expect(fakePeers(0, 7)).toEqual([]);
    expect(fakePeers(-2, 7)).toEqual([]);
    expect(fakePeers(NaN, 7)).toEqual([]);
    expect(fakePeers(MAX_FAKE_PEERS + 5, 7)).toEqual(
      fakePeers(MAX_FAKE_PEERS, 7)
    );
  });
});
