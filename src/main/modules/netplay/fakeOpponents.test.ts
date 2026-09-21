import type { PublicView } from '@shared/game';
import { describe, expect, it } from 'vitest';

import {
  fakePeers,
  MAX_FAKE_PEERS,
  MIRROR_SEAT,
  mirroredView,
} from './fakeOpponents';

const counts = [1, 2, 3];

// The battlefield's logical field, as the renderer's board layout sizes
// it. A card reaches this far right and down from its position.
const FIELD = 640;
const CARD_EXTENT = 230;

const battlefield = (peer: ReturnType<typeof fakePeers>[number]) =>
  peer.view!.zones.battlefield;

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

  it('starts every fake on the life it is given', () => {
    fakePeers(MAX_FAKE_PEERS, 7, 30).forEach((peer) => {
      expect(peer.view!.life).toBe(30);
    });
  });

  it('defaults to constructed life rather than commander', () => {
    expect(fakePeers(1, 7)[0].view!.life).toBe(20);
  });

  it('spreads a board out instead of stacking it on one position', () => {
    const cards = battlefield(fakePeers(1, 7)[0]);
    const places = new Set(
      cards.map((card) => `${card.position?.x},${card.position?.y}`)
    );

    expect(cards.length).toBeGreaterThan(5);
    expect(places.size).toBe(cards.length);
  });

  it('uses both rows and most of the field width', () => {
    const cards = battlefield(fakePeers(1, 7)[0]);
    const xs = cards.map((card) => card.position!.x);
    const ys = cards.map((card) => card.position!.y);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(FIELD / 2);
    expect(
      new Set(ys.map((y) => (y > FIELD / 2 ? 'back' : 'front'))).size
    ).toBe(2);
  });

  it('keeps every card inside the logical field', () => {
    fakePeers(MAX_FAKE_PEERS, 7).forEach((peer) => {
      battlefield(peer).forEach(({ position }) => {
        expect(position).not.toBeNull();
        expect(position!.x).toBeGreaterThanOrEqual(0);
        expect(position!.y).toBeGreaterThanOrEqual(0);
        expect(position!.x).toBeLessThanOrEqual(FIELD - CARD_EXTENT);
        expect(position!.y).toBeLessThanOrEqual(FIELD - CARD_EXTENT);
      });
    });
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

// A local view, as the player's own game produces it: ids not yet
// namespaced against anyone.
const localView = (): PublicView => ({
  seq: 3,
  playerId: 'alice',
  name: 'Alice',
  life: 40,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: {
    battlefield: [
      {
        instanceId: 'c1',
        ref: {
          id: 'forest',
          name: 'Forest',
          typeLine: 'Basic Land — Forest',
          faces: [{ name: 'Forest', typeLine: 'Basic Land — Forest' }],
        },
        owner: 'alice',
        controller: 'alice',
        zone: 'battlefield',
        position: { x: 0, y: 0 },
        tapped: false,
        faceDown: false,
        faceIndex: 0,
        counters: {},
        isToken: false,
        attachedTo: null,
      },
    ],
    graveyard: [],
    exile: [],
    command: [],
  },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
});

describe('mirroredView', () => {
  it('namespaces against the mirror seat, so ids cannot collide', () => {
    const [seat] = fakePeers(MIRROR_SEAT + 1, 7);
    const mirrored = mirroredView(localView());

    expect(mirrored!.zones.battlefield[0].instanceId).toBe(
      `${seat.info.playerId}/c1`
    );
    expect(mirrored!.life).toBe(40);
  });

  it('has nothing to show without a local view', () => {
    expect(mirroredView(null)).toBeNull();
  });
});
