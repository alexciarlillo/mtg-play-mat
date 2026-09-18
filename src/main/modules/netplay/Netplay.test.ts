// @vitest-environment node
import type { PublicView } from '@shared/game';
import { packDescription } from '@shared/net/codec';
import type { NetCommand, NetState } from '@shared/net/lobby';
import type { NetMessage } from '@shared/net/protocol';
import type { OpponentState } from '@shared/net/remoteViews';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Netplay from './Netplay';

const view = (playerId: string, life = 20): PublicView => ({
  seq: life,
  playerId,
  name: playerId,
  life,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: { battlefield: [], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
});

const names: Record<string, string> = {
  alice: 'Alice',
  bob: 'Bob',
  carol: 'Carol',
  dave: 'Dave',
};

type Send = Extract<NetCommand, { op: 'send' }>;

const setup = (me = 'alice') => {
  const commands: NetCommand[] = [];
  const states: NetState[] = [];
  const opponents: OpponentState[] = [];
  const transport = {
    open: vi.fn(() => Promise.resolve(true)),
    send: (command: NetCommand) => commands.push(command),
    retire: vi.fn(),
  };
  let local: PublicView | null = view(me);
  const rolls: number[] = [];
  const netplay = new Netplay({
    transport,
    config: { iceServers: [], recordWire: false },
    appVersion: '9.9.9',
    profile: () => ({ playerId: me, displayName: names[me] }),
    localView: () => local,
    pushState: (s) => states.push(s),
    pushOpponent: (s) => opponents.push(s),
    connectTimeoutMs: 50,
    randomInt: (max) => {
      rolls.push(max);
      return max - 1;
    },
  });
  const sends = () => commands.filter((c): c is Send => c.op === 'send');
  // Everything sent to one seat, decoded.
  const sentTo = (seat: number) =>
    sends()
      .filter((c) => c.seats.includes(seat))
      .map((c) => JSON.parse(c.data) as NetMessage);
  return {
    netplay,
    transport,
    commands,
    sends,
    sentTo,
    opponents,
    rolls,
    opponent: () => opponents.at(-1),
    state: () => netplay.netState,
    setLocal: (v: PublicView | null) => {
      local = v;
    },
  };
};

type Harness = ReturnType<typeof setup>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const raw = (from: string, seq: number, payload: Record<string, unknown>) =>
  JSON.stringify({ v: 2, seq, from, ...payload });

const hello = (from: string, seq = 1) =>
  raw(from, seq, {
    kind: 'hello',
    playerId: from,
    name: names[from],
    appVersion: '1',
  });

const say = (t: Harness, seat: number, data: string) =>
  t.netplay.handleReport({ type: 'message', seat, data });

// The host with guests in the given seats, each connected and greeted.
const hostWith = async (guests: Record<number, string>) => {
  const t = setup();
  await t.netplay.host();
  for (const [seatKey, id] of Object.entries(guests)) {
    const seat = Number(seatKey);
    if (seat !== 2) await t.netplay.invite(seat);
    t.netplay.handleReport({ type: 'invite', seat, code: `MPM1:i${seat}` });
    t.netplay.handleReport({ type: 'open', seat });
    say(t, seat, hello(id));
  }
  return t;
};

const guestIn = async (roster: [string, number][] = []) => {
  const t = setup('bob');
  const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
  await t.netplay.join(invite);
  await flush();
  t.netplay.handleReport({ type: 'reply', seat: 1, code: 'MPM1:r' });
  t.netplay.handleReport({ type: 'open', seat: 1 });
  say(t, 1, hello('alice'));
  if (roster.length > 0) {
    say(
      t,
      1,
      raw('alice', 2, {
        kind: 'roster',
        players: roster.map(([playerId, seat]) => ({
          playerId,
          name: names[playerId],
          seat,
        })),
      })
    );
  }
  return t;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Netplay host', () => {
  it('hosts: opens a fresh transport and invites the first seat', async () => {
    const t = setup();
    await t.netplay.host();
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.commands.at(-1)).toMatchObject({ op: 'host', seat: 2 });
    expect(t.state()).toMatchObject({ role: 'host', phase: 'creatingInvite' });

    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'MPM1:abc' });
    expect(t.state().phase).toBe('awaitingReply');
    expect(t.state().seats).toEqual([
      expect.objectContaining({
        seat: 2,
        phase: 'awaitingReply',
        invite: 'MPM1:abc',
      }),
      expect.objectContaining({ seat: 3, phase: 'empty', invite: null }),
      expect.objectContaining({ seat: 4, phase: 'empty', invite: null }),
    ]);
  });

  it('gives each seat its own invite', async () => {
    const t = setup();
    await t.netplay.host();
    await t.netplay.invite(4);
    expect(t.commands.at(-1)).toMatchObject({ op: 'host', seat: 4 });
    t.netplay.handleReport({ type: 'invite', seat: 4, code: 'MPM1:four' });
    expect(t.state().seats[2]).toMatchObject({ invite: 'MPM1:four' });
    // A seat already in use is not invited again; nor is seat 1 or 5.
    const count = t.commands.length;
    await t.netplay.invite(4);
    await t.netplay.invite(1);
    await t.netplay.invite(5);
    expect(t.commands).toHaveLength(count);
  });

  it('explains a pasted invite where a reply belongs', async () => {
    const t = setup();
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'x' });
    const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
    await t.netplay.acceptReply(2, invite);
    expect(t.state().seats[0].error).toMatch(/invite, not a reply/);
    expect(t.commands.some((c) => c.op === 'acceptReply')).toBe(false);

    await t.netplay.acceptReply(2, 'garbage');
    expect(t.state().seats[0].error).toMatch(/not an MTG Play Mat code/);
  });

  it('times out a seat that never connects with a friendly error', async () => {
    const t = setup();
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'x' });
    const reply = await packDescription({ type: 'answer', sdp: 'v=0' });
    await t.netplay.acceptReply(2, `  ${reply}\n`);
    expect(t.commands.at(-1)).toEqual({
      op: 'acceptReply',
      seat: 2,
      code: reply,
    });
    expect(t.state().phase).toBe('connecting');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(t.state().seats[0]).toMatchObject({ phase: 'awaitingReply' });
    expect(t.state().seats[0].error).toMatch(/Could not find a route/);
  });

  it('greets a new seat, binds it to its hello, and sends the roster', async () => {
    const t = await hostWith({ 2: 'bob' });
    const [hi, pub, roster] = t.sentTo(2);
    expect(hi).toMatchObject({ seq: 1, from: 'alice', kind: 'hello' });
    expect(pub).toMatchObject({ seq: 2, kind: 'public' });
    expect(roster).toEqual({
      v: 2,
      seq: 3,
      from: 'alice',
      kind: 'roster',
      players: [
        { playerId: 'alice', name: 'Alice', seat: 1 },
        { playerId: 'bob', name: 'Bob', seat: 2 },
      ],
    });
    expect(t.state()).toMatchObject({
      phase: 'connected',
      status: 'Connected to Bob.',
    });
    expect(t.state().seats[0].player?.name).toBe('Bob');
    expect(t.opponent()).toMatchObject({
      selfSeat: 1,
      peers: [{ info: { name: 'Bob' }, seat: 2 }],
    });
  });

  it('relays each guest to the others unchanged, never back', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol', 4: 'dave' });
    const fromBob = raw('bob', 2, { kind: 'public', view: view('bob', 12) });
    say(t, 2, fromBob);
    const relayed = t.sends().filter((c) => c.data === fromBob);
    expect(relayed).toEqual([{ op: 'send', seats: [3, 4], data: fromBob }]);
    expect(
      t.opponent()?.peers.find((p) => p.info.playerId === 'bob')?.view?.life
    ).toBe(12);

    // A stale repeat is neither shown nor relayed.
    const count = t.sends().length;
    say(t, 2, raw('bob', 2, { kind: 'public', view: view('bob', 1) }));
    expect(t.sends()).toHaveLength(count);

    // The host's own changes go to every seat, numbered by the host.
    t.netplay.localViewChanged(view('alice', 17));
    expect(t.sends().at(-1)?.seats).toEqual([2, 3, 4]);
    const own = JSON.parse(t.sends().at(-1)?.data ?? '{}') as NetMessage;
    expect(own).toMatchObject({ from: 'alice', view: { life: 17 } });
  });

  it('brings a newcomer up to date with everyone already there', async () => {
    const t = await hostWith({ 2: 'bob' });
    const bobView = raw('bob', 2, { kind: 'public', view: view('bob', 9) });
    say(t, 2, bobView);

    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:c' });
    await t.netplay.invite(3);
    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:c' });
    t.netplay.handleReport({ type: 'open', seat: 3 });
    say(t, 3, hello('carol'));

    const toCarol = t.sends().filter((c) => c.seats.includes(3));
    const data = toCarol.map((c) => c.data);
    expect(data).toContain(hello('bob'));
    expect(data).toContain(bobView);
    // Bob hears about Carol through the roster and her own hello.
    expect(t.sentTo(2).at(-2)).toMatchObject({
      kind: 'roster',
      players: [
        { playerId: 'alice' },
        { playerId: 'bob', seat: 2 },
        { playerId: 'carol', seat: 3 },
      ],
    });
    expect(t.sends().at(-1)).toEqual({
      op: 'send',
      seats: [2],
      data: hello('carol'),
    });
  });

  it('drops messages a guest sends as another player', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = t.sends().length;
    const opponents = t.opponents.length;
    const spoof = raw('carol', 50, {
      kind: 'public',
      view: view('carol', 1),
    });
    say(t, 2, spoof);
    say(t, 2, raw('alice', 50, { kind: 'bye' }));
    say(
      t,
      2,
      raw('carol', 51, {
        kind: 'hello',
        playerId: 'carol',
        name: 'Mallory',
        appVersion: '1',
      })
    );
    expect(t.sends()).toHaveLength(count);
    expect(t.opponents).toHaveLength(opponents);
    expect(warn).toHaveBeenCalledWith(
      '[netplay] dropped message sent as another player'
    );
    warn.mockRestore();
  });

  it('only accepts rosters and results from itself', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    const count = t.sends().length;
    say(
      t,
      2,
      raw('bob', 2, {
        kind: 'roster',
        players: [{ playerId: 'bob', name: 'Bob', seat: 1 }],
      })
    );
    say(
      t,
      2,
      raw('bob', 3, {
        kind: 'event',
        id: 1,
        by: 'bob',
        byName: 'Bob',
        roll: { type: 'die', sides: 20, result: 20 },
      })
    );
    expect(t.sends()).toHaveLength(count);
    expect(t.opponent()?.log).toEqual([]);
    expect(t.opponent()?.peers).toHaveLength(2);
  });

  it('refuses a second seat for a player already in the pod', async () => {
    const t = await hostWith({ 2: 'bob' });
    await t.netplay.invite(3);
    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:c' });
    t.netplay.handleReport({ type: 'open', seat: 3 });
    say(t, 3, hello('bob'));
    expect(t.commands).toContainEqual({ op: 'close', seat: 3 });
    expect(t.state().seats[1]).toMatchObject({
      phase: 'empty',
      error: 'That player is already in the pod.',
    });
    expect(t.opponent()?.peers).toHaveLength(1);
  });

  it('closes a seat whose guest speaks an older protocol', async () => {
    const t = setup();
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'x' });
    t.netplay.handleReport({ type: 'open', seat: 2 });
    say(
      t,
      2,
      JSON.stringify({
        v: 1,
        seq: 1,
        from: 'bob',
        kind: 'hello',
        playerId: 'bob',
        name: 'Bob',
        appVersion: '0.1.0',
      })
    );
    expect(t.commands.at(-1)).toEqual({ op: 'close', seat: 2 });
    expect(t.state().seats[0]).toMatchObject({ phase: 'empty' });
    expect(t.state().seats[0].error).toMatch(
      /Version mismatch: .*protocol 1, this one speaks 2/
    );
  });

  it('rolls for a guest and tells everyone', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    say(
      t,
      3,
      raw('carol', 2, { kind: 'roll', request: { type: 'die', sides: 20 } })
    );
    expect(t.rolls).toEqual([20]);
    const event = {
      id: 1,
      by: 'carol',
      byName: 'Carol',
      roll: { type: 'die', sides: 20, result: 20 },
    };
    expect(t.sends().at(-1)?.seats).toEqual([2, 3]);
    expect(t.sentTo(2).at(-1)).toMatchObject({
      from: 'alice',
      kind: 'event',
      ...event,
    });
    expect(t.opponent()?.log).toEqual([event]);

    // The host rolls for itself too; a bad request is ignored.
    t.netplay.roll({ type: 'coin' });
    t.netplay.roll({ type: 'die', sides: 1 });
    expect(t.opponent()?.log.at(-1)).toMatchObject({
      id: 2,
      byName: 'Alice',
      roll: { type: 'coin', result: 'tails' },
    });
    expect(t.opponent()?.log).toHaveLength(2);
  });

  it('removes a guest who leaves and tells the rest', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol', 4: 'dave' });
    const bye = raw('carol', 2, { kind: 'bye' });
    say(t, 3, bye);
    expect(t.sends()).toContainEqual({ op: 'send', seats: [2, 4], data: bye });
    expect(t.commands).toContainEqual({ op: 'close', seat: 3 });
    expect(t.sentTo(2).at(-1)).toMatchObject({
      kind: 'roster',
      players: [
        { playerId: 'alice' },
        { playerId: 'bob' },
        { playerId: 'dave' },
      ],
    });
    expect(t.opponent()?.peers.map((p) => p.info.name)).toEqual([
      'Bob',
      'Dave',
    ]);
    expect(t.state().seats[1]).toMatchObject({ phase: 'empty', player: null });
    expect(t.state().status).toMatch(/^Carol left the game\. Connected to/);
    expect(t.state().phase).toBe('connected');

    // A dropped link counts as leaving too; the seat can be invited again.
    t.netplay.handleReport({ type: 'closed', seat: 4 });
    expect(t.opponent()?.peers.map((p) => p.info.name)).toEqual(['Bob']);
    await t.netplay.invite(4);
    expect(t.commands.at(-1)).toMatchObject({ op: 'host', seat: 4 });
  });

  it('says goodbye to everyone and retires the transport on leave', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    t.transport.retire.mockClear();
    t.netplay.leave();
    const bye = t.sends().at(-1);
    expect(bye?.seats).toEqual([2, 3]);
    expect(JSON.parse(bye?.data ?? '{}')).toMatchObject({ kind: 'bye' });
    expect(t.commands.at(-1)).toEqual({ op: 'leave' });
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.state()).toMatchObject({ role: null, phase: 'idle', seats: [] });
    expect(t.opponent()).toMatchObject({ peers: [] });
  });

  it('ignores malformed reports from the net window', async () => {
    const t = setup();
    t.netplay.handlers.netReport({ type: 'invite' } as never);
    t.netplay.handlers.netReport('nope' as never);
    expect(t.state().phase).toBe('idle');
    await t.netplay.host();
    // Seats outside the pod are not reports at all.
    t.netplay.handlers.netReport({ type: 'open', seat: 9 } as never);
    expect(t.state().seats.every((s) => s.phase !== 'connected')).toBe(true);
  });
});

describe('Netplay guest', () => {
  it('joins from a link and clears the pending invite', async () => {
    const t = setup('bob');
    const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
    expect(t.netplay.receiveLink(`mtgplaymat://join?c=${invite}`)).toBe(true);
    expect(t.state().pendingInvite).toBe(invite);

    await t.netplay.join(t.state().pendingInvite);
    await flush();
    expect(t.commands.at(-1)).toMatchObject({ op: 'join', code: invite });
    expect(t.state()).toMatchObject({
      role: 'guest',
      phase: 'creatingReply',
      pendingInvite: null,
    });
    t.netplay.handleReport({ type: 'reply', seat: 1, code: 'MPM1:r' });
    expect(t.state()).toMatchObject({ phase: 'awaitingHost', reply: 'MPM1:r' });
  });

  it('says hello and sends its public view when the channel opens', async () => {
    const t = await guestIn();
    const [hi, pub] = t.sentTo(1);
    expect(hi).toEqual({
      v: 2,
      seq: 1,
      from: 'bob',
      kind: 'hello',
      playerId: 'bob',
      name: 'Bob',
      appVersion: '9.9.9',
    });
    expect(pub).toMatchObject({ seq: 2, kind: 'public', view: view('bob') });
    expect(t.state()).toMatchObject({
      phase: 'connected',
      status: 'Connected to Alice.',
    });
  });

  it('shows everyone the host relays and takes seats from the roster', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
      ['dave', 4],
    ]);
    say(t, 1, hello('carol', 30));
    say(t, 1, raw('carol', 31, { kind: 'public', view: view('carol', 8) }));
    say(t, 1, hello('dave'));
    say(t, 1, raw('alice', 3, { kind: 'public', view: view('alice', 40) }));
    expect(t.state().players.map((p) => p.seat)).toEqual([1, 2, 3, 4]);
    expect(t.state().status).toBe('Connected to Alice, Carol, Dave.');
    const snap = t.opponent();
    expect(snap?.selfSeat).toBe(2);
    expect(snap?.peers.map((p) => [p.info.name, p.seat, p.view?.life])).toEqual(
      [
        ['Alice', 1, 40],
        ['Carol', 3, 8],
        ['Dave', 4, undefined],
      ]
    );
  });

  it('drops players the roster no longer lists', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    say(
      t,
      1,
      raw('alice', 3, {
        kind: 'roster',
        players: [
          { playerId: 'alice', name: 'Alice', seat: 1 },
          { playerId: 'bob', name: 'Bob', seat: 2 },
        ],
      })
    );
    expect(t.opponent()?.peers.map((p) => p.info.name)).toEqual(['Alice']);
    expect(t.state().status).toBe('Carol left the game. Connected to Alice.');
    expect(t.state().phase).toBe('connected');
    // The notice goes once someone new arrives.
    say(t, 1, hello('dave'));
    expect(t.state().status).toBe('Connected to Alice, Dave.');
  });

  it('ignores rosters and results not from the host', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    say(
      t,
      1,
      raw('carol', 2, {
        kind: 'roster',
        players: [{ playerId: 'carol', name: 'Carol', seat: 1 }],
      })
    );
    say(
      t,
      1,
      raw('carol', 3, {
        kind: 'event',
        id: 9,
        by: 'carol',
        byName: 'Carol',
        roll: { type: 'coin', result: 'heads' },
      })
    );
    expect(t.opponent()?.peers).toHaveLength(2);
    expect(t.opponent()?.log).toEqual([]);
    expect(t.state().players).toHaveLength(3);
  });

  it('asks the host to roll and logs the result it sends', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
    ]);
    t.netplay.roll({ type: 'die', sides: 6 });
    expect(t.rolls).toEqual([]);
    expect(t.sentTo(1).at(-1)).toMatchObject({
      kind: 'roll',
      request: { type: 'die', sides: 6 },
    });
    const event = {
      id: 1,
      by: 'bob',
      byName: 'Bob',
      roll: { type: 'die', sides: 6, result: 4 },
    };
    say(t, 1, raw('alice', 3, { kind: 'event', ...event }));
    expect(t.opponent()?.log).toEqual([event]);
  });

  it('removes a player who says goodbye but stays in the pod', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    say(t, 1, raw('carol', 2, { kind: 'bye' }));
    expect(t.opponent()?.peers.map((p) => p.info.name)).toEqual(['Alice']);
    expect(t.state()).toMatchObject({
      phase: 'connected',
      status: 'Carol left the game. Connected to Alice.',
    });
  });

  it('ends the pod when the host leaves or the link drops', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    say(t, 1, raw('alice', 3, { kind: 'bye' }));
    expect(t.opponent()).toMatchObject({ peers: [] });
    expect(t.state()).toMatchObject({
      phase: 'ended',
      status: 'The host (Alice) left the game. The pod has ended.',
      players: [],
    });

    const u = await guestIn();
    u.netplay.handleReport({ type: 'closed', seat: 1 });
    expect(u.opponent()).toMatchObject({ peers: [] });
    expect(u.state()).toMatchObject({
      phase: 'ended',
      status: 'Lost the connection to the host. The pod has ended.',
    });
  });

  it('ends with a clear message when the host is on another version', async () => {
    const t = setup('bob');
    const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
    await t.netplay.join(invite);
    await flush();
    t.netplay.handleReport({ type: 'open', seat: 1 });
    say(t, 1, JSON.stringify({ v: 1, seq: 1, from: 'alice', kind: 'bye' }));
    expect(t.state().phase).toBe('ended');
    expect(t.state().error).toMatch(/^Version mismatch/);
  });

  it('streams local changes and drops stale or malformed ones', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
    ]);
    t.netplay.localViewChanged(view('bob', 17));
    expect(t.sentTo(1).at(-1)).toMatchObject({ seq: 3, view: { life: 17 } });

    say(t, 1, raw('alice', 3, { kind: 'public', view: view('alice', 12) }));
    expect(t.opponent()?.peers[0].view?.life).toBe(12);

    const before = t.opponents.length;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const data of [
      raw('alice', 3, { kind: 'public', view: view('alice', 1) }),
      raw('alice', 4, { kind: 'public', view: { life: 'lots' } }),
      'x'.repeat(300_000),
    ]) {
      say(t, 1, data);
    }
    warn.mockRestore();
    expect(t.opponents).toHaveLength(before);
  });

  it('resends hello and the current view on request', async () => {
    const t = await guestIn();
    t.setLocal(view('bob', 5));
    t.netplay.resend();
    expect(t.sentTo(1).slice(-2)).toMatchObject([
      { kind: 'hello' },
      { kind: 'public', view: { life: 5 } },
    ]);
  });
});
