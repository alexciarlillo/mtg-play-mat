import { describe, expect, it } from 'vitest';

import type { PublicView } from '../game';
import type { NetMessage, TableEvent } from './protocol';
import { MAX_LOG, RemoteViews } from './remoteViews';

const view = (life: number, playerId = 'bob'): PublicView => ({
  seq: life,
  playerId,
  name: playerId,
  life,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: {
    battlefield: [
      {
        instanceId: `${playerId}:3`,
        ref: null,
        owner: playerId,
        controller: playerId,
        zone: 'battlefield',
        position: { x: 0, y: 0 },
        tapped: false,
        faceDown: true,
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

const names: Record<string, string> = {
  bob: 'Bob',
  carol: 'Carol',
  dave: 'Dave',
  alice: 'Alice',
};

const hello = (seq: number, from = 'bob'): NetMessage => ({
  v: 2,
  seq,
  from,
  kind: 'hello',
  playerId: from,
  name: names[from],
  appVersion: '0.1.0',
});

const pub = (seq: number, life: number, from = 'bob'): NetMessage => ({
  v: 2,
  seq,
  from,
  kind: 'public',
  view: view(life, from),
});

const bye = (seq: number, from = 'bob'): NetMessage => ({
  v: 2,
  seq,
  from,
  kind: 'bye',
});

const store = () => new RemoteViews(() => 'alice');

const peer = (remote: RemoteViews, id: string) =>
  remote.snapshot().peers.find((p) => p.info.playerId === id);

describe('RemoteViews', () => {
  it('ignores views until the peer says hello', () => {
    const remote = store();
    expect(remote.receive(pub(1, 20))).toBe(false);
    expect(remote.snapshot()).toEqual({
      seq: 0,
      selfSeat: null,
      peers: [],
      log: [],
    });
  });

  it('keeps the newest view per sender and drops stale ones', () => {
    const remote = store();
    remote.receive(hello(1));
    expect(remote.receive(pub(3, 18))).toBe(true);
    expect(remote.receive(pub(2, 19))).toBe(false);
    expect(remote.receive(pub(3, 17))).toBe(false);
    // Carol has not said hello yet.
    expect(remote.receive(pub(9, 1, 'carol'))).toBe(false);

    const bob = peer(remote, 'bob');
    expect(bob?.info.name).toBe('Bob');
    expect(bob?.view?.life).toBe(18);
    expect(bob?.view?.zones.battlefield[0].instanceId).toBe('bob/bob:3');
  });

  it('holds several peers, each with its own sequence', () => {
    const remote = store();
    remote.receive(hello(1, 'bob'));
    remote.receive(hello(40, 'carol'));
    remote.receive(hello(1, 'dave'));
    // Relayed messages keep their sender's numbering, so one peer's
    // high seq does not make another's look stale.
    expect(remote.receive(pub(2, 15, 'bob'))).toBe(true);
    expect(remote.receive(pub(41, 30, 'carol'))).toBe(true);
    expect(remote.receive(pub(2, 9, 'dave'))).toBe(true);
    expect(remote.receive(pub(41, 1, 'carol'))).toBe(false);

    const lives = remote.snapshot().peers.map((p) => p.view?.life);
    expect(lives.sort()).toEqual([15, 30, 9].sort());
    expect(peer(remote, 'carol')?.view?.zones.battlefield[0].instanceId).toBe(
      'carol/carol:3'
    );
  });

  it('never holds a view of the local player', () => {
    const remote = store();
    expect(remote.receive(hello(1, 'alice'))).toBe(false);
    expect(remote.snapshot().peers).toEqual([]);
  });

  it('bumps seq on every change so windows can order snapshots', () => {
    const remote = store();
    remote.receive(hello(1));
    const a = remote.snapshot().seq;
    remote.receive(pub(2, 20));
    expect(remote.snapshot().seq).toBeGreaterThan(a);
  });

  it('keeps the board on a repeated hello', () => {
    const remote = store();
    remote.receive(hello(1));
    remote.receive(pub(2, 15));
    remote.receive(hello(3));
    expect(peer(remote, 'bob')?.view?.life).toBe(15);
  });

  it('a view of null means the peer has no game open', () => {
    const remote = store();
    remote.receive(hello(1));
    remote.receive(pub(2, 20));
    remote.receive({ v: 2, seq: 3, from: 'bob', kind: 'public', view: null });
    expect(peer(remote, 'bob')).toMatchObject({
      info: { name: 'Bob' },
      view: null,
    });
  });

  it('a bye or remove drops only that peer', () => {
    const remote = store();
    remote.receive(hello(1, 'bob'));
    remote.receive(hello(1, 'carol'));
    remote.receive(hello(1, 'dave'));
    expect(remote.receive(bye(2, 'bob'))).toBe(true);
    expect(remote.connectedPeers.map((p) => p.name).sort()).toEqual([
      'Carol',
      'Dave',
    ]);
    expect(remote.remove('dave')).toBe(true);
    expect(remote.remove('dave')).toBe(false);
    expect(remote.connectedPeers.map((p) => p.name)).toEqual(['Carol']);
  });

  it('takes seats from the roster, sorts by them, and drops the missing', () => {
    const remote = store();
    remote.receive(hello(1, 'bob'));
    remote.receive(hello(1, 'carol'));
    remote.receive(hello(1, 'dave'));
    const dropped = remote.setRoster([
      { playerId: 'bob', name: 'Bob', seat: 1 },
      { playerId: 'dave', name: 'Dave', seat: 2 },
      { playerId: 'alice', name: 'Alice', seat: 4 },
    ]);
    expect(dropped.map((p) => p.name)).toEqual(['Carol']);
    const snap = remote.snapshot();
    expect(snap.selfSeat).toBe(4);
    expect(snap.peers.map((p) => [p.info.name, p.seat])).toEqual([
      ['Bob', 1],
      ['Dave', 2],
    ]);
  });

  it('keeps a bounded log of table events', () => {
    const remote = store();
    const event = (id: number): TableEvent => ({
      id,
      by: 'bob',
      byName: 'Bob',
      roll: { type: 'die', sides: 20, result: 1 + (id % 20) },
    });
    for (let id = 1; id <= MAX_LOG + 5; id += 1) remote.addEvent(event(id));
    const { log } = remote.snapshot();
    expect(log).toHaveLength(MAX_LOG);
    expect(log.at(-1)).toMatchObject({
      kind: 'roll',
      id: MAX_LOG + 5,
      event: { id: MAX_LOG + 5 },
    });
  });

  it('clear drops everyone but keeps the log', () => {
    const remote = store();
    remote.receive(hello(1));
    remote.addEvent({
      id: 1,
      by: 'bob',
      byName: 'Bob',
      roll: { type: 'coin', result: 'heads' },
    });
    expect(remote.clear()).toBe(true);
    expect(remote.clear()).toBe(false);
    expect(remote.snapshot()).toMatchObject({
      peers: [],
      log: [{ kind: 'roll' }],
    });
  });

  it('merges peer log lines and rolls into one timeline', () => {
    let now = 100;
    const remote = new RemoteViews(
      () => 'alice',
      () => (now += 1)
    );
    remote.receive(hello(1));
    remote.addAction('alice', 'Alice', 'drew a card');
    expect(
      remote.receive({ v: 2, seq: 2, from: 'bob', kind: 'log', text: 'x' })
    ).toBe(true);
    remote.addEvent({
      id: 1,
      by: 'bob',
      byName: 'Bob',
      roll: { type: 'coin', result: 'heads' },
    });
    // Stale, before hello, or from ourselves: dropped.
    const stale = { v: 2, seq: 2, from: 'bob', kind: 'log', text: 'y' };
    const stranger = { ...stale, seq: 9, from: 'carol' };
    const self = { ...stale, seq: 9, from: 'alice' };
    for (const message of [stale, stranger, self]) {
      expect(remote.receive(message as NetMessage)).toBe(false);
    }
    expect(remote.snapshot().log).toEqual([
      {
        kind: 'action',
        id: 1,
        at: 101,
        playerId: 'alice',
        playerName: 'Alice',
        text: 'drew a card',
      },
      {
        kind: 'action',
        id: 2,
        at: 102,
        playerId: 'bob',
        playerName: 'Bob',
        text: 'x',
      },
      expect.objectContaining({ kind: 'roll', id: 3, at: 103 }),
    ]);
  });
});
