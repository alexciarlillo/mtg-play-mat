import { describe, expect, it } from 'vitest';

import type { PublicView } from '../game';
import type { NetMessage } from './protocol';
import { RemoteViews } from './remoteViews';

const view = (life: number): PublicView => ({
  seq: life,
  playerId: 'bob',
  name: 'Bob',
  life,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: {
    battlefield: [
      {
        instanceId: 'bob:3',
        ref: null,
        owner: 'bob',
        controller: 'bob',
        zone: 'battlefield',
        position: { x: 0, y: 0 },
        tapped: false,
        faceDown: true,
        faceIndex: 0,
        counters: {},
        isToken: false,
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

const hello = (seq: number, from = 'bob'): NetMessage => ({
  v: 1,
  seq,
  from,
  kind: 'hello',
  playerId: from,
  name: from === 'bob' ? 'Bob' : 'Carol',
  appVersion: '0.1.0',
});

const pub = (seq: number, life: number, from = 'bob'): NetMessage => ({
  v: 1,
  seq,
  from,
  kind: 'public',
  view: view(life),
});

describe('RemoteViews', () => {
  it('ignores views until the peer says hello', () => {
    const remote = new RemoteViews();
    expect(remote.receive(pub(1, 20))).toBe(false);
    expect(remote.snapshot()).toEqual({ seq: 0, peer: null, view: null });
  });

  it('keeps the newest view and drops stale or foreign ones', () => {
    const remote = new RemoteViews();
    remote.receive(hello(1));
    expect(remote.receive(pub(3, 18))).toBe(true);
    expect(remote.receive(pub(2, 19))).toBe(false);
    expect(remote.receive(pub(3, 17))).toBe(false);
    expect(remote.receive(pub(9, 1, 'carol'))).toBe(false);

    const snap = remote.snapshot();
    expect(snap.peer?.name).toBe('Bob');
    expect(snap.view?.life).toBe(18);
    expect(snap.view?.zones.battlefield[0].instanceId).toBe('bob/bob:3');
  });

  it('bumps seq on every change so windows can order snapshots', () => {
    const remote = new RemoteViews();
    remote.receive(hello(1));
    const a = remote.snapshot().seq;
    remote.receive(pub(2, 20));
    expect(remote.snapshot().seq).toBeGreaterThan(a);
  });

  it('keeps the board on a repeated hello and resets on a new peer', () => {
    const remote = new RemoteViews();
    remote.receive(hello(1));
    remote.receive(pub(2, 15));
    remote.receive(hello(3));
    expect(remote.snapshot().view?.life).toBe(15);
    remote.receive(hello(1, 'carol'));
    expect(remote.snapshot()).toMatchObject({
      peer: { playerId: 'carol' },
      view: null,
    });
  });

  it('a view of null means the peer has no game open', () => {
    const remote = new RemoteViews();
    remote.receive(hello(1));
    remote.receive(pub(2, 20));
    remote.receive({ v: 1, seq: 3, from: 'bob', kind: 'public', view: null });
    expect(remote.snapshot()).toMatchObject({
      peer: { name: 'Bob' },
      view: null,
    });
  });

  it('bye and clear drop the peer', () => {
    const remote = new RemoteViews();
    remote.receive(hello(1));
    remote.receive(pub(2, 20));
    expect(remote.receive({ v: 1, seq: 3, from: 'bob', kind: 'bye' })).toBe(
      true
    );
    expect(remote.snapshot()).toMatchObject({ peer: null, view: null });

    remote.receive(hello(1));
    expect(remote.clear()).toBe(true);
    expect(remote.clear()).toBe(false);
    expect(remote.connectedPeer).toBeNull();
  });
});
