// @vitest-environment node
import type { ControlChange, PublicView } from '@shared/game';
import { packDescription } from '@shared/net/codec';
import type { NetCommand, NetState } from '@shared/net/lobby';
import type { NetMessage } from '@shared/net/protocol';
import type { OpponentState } from '@shared/net/remoteViews';
import type { DeckFormat } from '@shared/types/decks';
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

// A battlefield card, so a mirrored view can be checked for namespaced
// instance ids rather than for its shape alone.
const withCard = (base: PublicView, instanceId: string): PublicView => ({
  ...base,
  zones: {
    ...base.zones,
    battlefield: [
      {
        instanceId,
        ref: {
          id: 'forest',
          name: 'Forest',
          typeLine: 'Basic Land — Forest',
          faces: [{ name: 'Forest', typeLine: 'Basic Land — Forest' }],
        },
        owner: base.playerId,
        controller: base.playerId,
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
  },
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
  // The relay transport records into the same list, so a test reads one
  // stream of commands whichever mode it drove.
  const relay = {
    open: vi.fn(() => Promise.resolve(true)),
    send: (command: NetCommand) => commands.push(command),
    retire: vi.fn(),
  };
  const logged: string[] = [];
  const keptMats: { id: string; data: string }[] = [];
  let localMat: { id: string; data: string } | null = null;
  let localBack: { id: string; data: string } | null = null;
  const keptBacks: { id: string; data: string }[] = [];
  let keepMats = true;
  let local: PublicView | null = view(me);
  let format: DeckFormat = 'constructed';
  const rolls: number[] = [];
  const control: [string, string, ControlChange][] = [];
  const gone: string[] = [];
  const netplay = new Netplay({
    transports: { p2p: transport, relay },
    config: { iceServers: [], recordWire: false },
    appVersion: '9.9.9',
    profile: () => ({ playerId: me, displayName: names[me] }),
    localView: () => local,
    localFormat: () => format,
    pushState: (s) => states.push(s),
    pushOpponent: (s) => opponents.push(s),
    log: { record: (level, _scope, text) => logged.push(`${level} ${text}`) },
    localMat: () => Promise.resolve(localMat),
    receiveMat: (id, data) => {
      keptMats.push({ id, data });
      return Promise.resolve(keepMats);
    },
    localBack: () => Promise.resolve(localBack),
    receiveBack: (id, data) => {
      keptBacks.push({ id, data });
      return Promise.resolve(true);
    },
    receiveControl: (from, name, change) => control.push([from, name, change]),
    peerGone: (playerId, name) => gone.push(`${playerId} ${name}`),
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
    relay,
    commands,
    sends,
    sentTo,
    opponents,
    logged,
    keptMats,
    keptBacks,
    rolls,
    control,
    gone,
    opponent: () => opponents.at(-1),
    state: () => netplay.netState,
    setLocal: (v: PublicView | null) => {
      local = v;
    },
    setFormat: (f: DeckFormat) => {
      format = f;
    },
    setMat: (next: { id: string; data: string } | null) => {
      localMat = next;
    },
    setBack: (next: { id: string; data: string } | null) => {
      localBack = next;
    },
    refuseMats: () => {
      keepMats = false;
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
    expect(t.logged).toContain(
      'warn dropped a message sent as another player seat=2'
    );
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

  it('logs its own actions and relays each guest’s log lines', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    t.netplay.localLogEntry('drew a card');
    expect(t.sends().at(-1)?.seats).toEqual([2, 3]);
    expect(t.sentTo(2).at(-1)).toMatchObject({
      from: 'alice',
      kind: 'log',
      text: 'drew a card',
    });

    const line = raw('bob', 2, { kind: 'log', text: 'played Forest' });
    say(t, 2, line);
    expect(t.sends().at(-1)).toEqual({ op: 'send', seats: [3], data: line });
    // A replayed (stale) line is neither shown nor relayed again.
    const count = t.sends().length;
    say(t, 2, line);
    expect(t.sends()).toHaveLength(count);

    expect(
      t.opponent()?.log.map((e) => e.kind === 'action' && e.playerName)
    ).toEqual(['Alice', 'Bob']);
    expect(t.opponent()?.log.at(-1)).toMatchObject({
      playerId: 'bob',
      text: 'played Forest',
    });
  });

  it('keeps log lines to one short line', async () => {
    const t = await hostWith({ 2: 'bob' });
    t.netplay.localLogEntry(`a\nb${'x'.repeat(400)}`);
    const sent = t.sentTo(2).at(-1) as { text: string };
    expect(sent.text.startsWith('a b')).toBe(true);
    expect(sent.text).toHaveLength(300);
    t.netplay.localLogEntry(' \n ');
    expect(t.sentTo(2).at(-1)).toEqual(sent);
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
    expect(t.opponent()?.log).toMatchObject([{ kind: 'roll', event }]);

    // The host rolls for itself too; a bad request is ignored.
    t.netplay.roll({ type: 'coin' });
    t.netplay.roll({ type: 'die', sides: 1 });
    expect(t.opponent()?.log.at(-1)).toMatchObject({
      kind: 'roll',
      event: {
        id: 2,
        byName: 'Alice',
        roll: { type: 'coin', result: 'tails' },
      },
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
      features: ['control'],
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

  it('shows log lines the host relays, and sends its own', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    say(t, 1, raw('carol', 2, { kind: 'log', text: 'drew 2 cards' }));
    say(t, 1, raw('alice', 3, { kind: 'log', text: 'shuffled' }));
    t.netplay.localLogEntry('milled a card: Forest');
    expect(t.sentTo(1).at(-1)).toMatchObject({
      from: 'bob',
      kind: 'log',
      text: 'milled a card: Forest',
    });
    expect(
      t
        .opponent()
        ?.log.map((e) =>
          e.kind === 'action' ? `${e.playerName} ${e.text}` : ''
        )
    ).toEqual([
      'Carol drew 2 cards',
      'Alice shuffled',
      'Bob milled a card: Forest',
    ]);
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
    expect(t.opponent()?.log).toMatchObject([{ kind: 'roll', event }]);
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
    for (const data of [
      raw('alice', 3, { kind: 'public', view: view('alice', 1) }),
      raw('alice', 4, { kind: 'public', view: { life: 'lots' } }),
      'x'.repeat(300_000),
    ]) {
      say(t, 1, data);
    }
    // The stale one is simply ignored; the other two cannot be read.
    expect(
      t.logged.filter((line) =>
        line.startsWith('warn dropped an unreadable message')
      )
    ).toHaveLength(2);
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

describe('Netplay fake opponents', () => {
  it('merges fake peers into the pushed and fetched opponent state', () => {
    const t = setup();
    expect(t.netplay.setFakeOpponents(3)).toBe(true);
    const pushed = t.opponent();
    expect(pushed?.peers).toHaveLength(3);
    expect(pushed?.peers.map((p) => p.seat)).toEqual([2, 3, 4]);
    expect(pushed?.selfSeat).toBe(1);
    expect(pushed?.peers.map((p) => p.info.playerId)).toEqual([
      'fake-mira',
      'fake-desmond',
      'fake-yuki',
    ]);
    // Only the first seat mirrors; the rest keep their generated boards.
    expect(pushed?.peers[0].view?.playerId).toBe('alice');
    expect(pushed?.peers[1].view?.playerId).toBe('fake-desmond');
    expect(t.netplay.handlers.getOpponentView()).toEqual(pushed);
  });

  it('mirrors the local board into the first fake seat, namespaced', () => {
    const t = setup();
    t.setLocal(withCard(view('alice'), 'c1'));
    t.netplay.setFakeOpponents(3);
    const mirror = t.opponent()?.peers[0];
    expect(mirror?.info.name).toBe('You (mirror)');
    expect(mirror?.view?.zones.battlefield[0].instanceId).toBe('fake-mira/c1');
    // The generated seats namespace against their own ids, so nothing
    // the board shows can collide with the local game's instance ids.
    const ids = t
      .opponent()
      ?.peers.flatMap((p) => p.view?.zones.battlefield ?? [])
      .map((c) => c.instanceId);
    expect(ids?.every((id) => id.startsWith('fake-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids?.length);
  });

  it('follows the local board as it changes', () => {
    const t = setup();
    t.netplay.setFakeOpponents(3);
    const before = t.opponent();
    t.netplay.localViewChanged(withCard(view('alice', 12), 'c2'));
    const after = t.opponent();
    expect(after).not.toBe(before);
    expect(after?.seq).toBeGreaterThan(before?.seq ?? 0);
    expect(after?.peers[0].view?.life).toBe(12);
    expect(after?.peers[0].view?.zones.battlefield[0].instanceId).toBe(
      'fake-mira/c2'
    );
    // The generated seats are untouched, so nothing is re-dealt.
    expect(after?.peers[1].view).toBe(before?.peers[1].view);
  });

  it('re-deals the generated seats when the format changes', () => {
    const t = setup();
    t.netplay.setFakeOpponents(3);
    expect(t.opponent()?.peers[1].view?.life).toBe(20);

    t.setFormat('commander');
    t.netplay.localViewChanged(view('alice', 40));
    const after = t.opponent();
    expect(after?.peers.map((p) => p.view?.life)).toEqual([40, 40, 40]);
    // The mirror still carries the local board rather than a dealt one.
    expect(after?.peers[0].view?.playerId).toBe('alice');
    expect(after?.peers[1].view?.playerId).toBe('fake-desmond');
  });

  it('leaves the generated seats alone while the format holds', () => {
    const t = setup();
    t.netplay.setFakeOpponents(3);
    const before = t.opponent();
    t.netplay.localViewChanged(view('alice', 12));
    expect(t.opponent()?.peers[1].view).toBe(before?.peers[1].view);
  });

  it('leaves the mirror seat blank until the local game has a view', () => {
    const t = setup();
    t.setLocal(null);
    t.netplay.setFakeOpponents(2);
    expect(t.opponent()?.peers).toHaveLength(2);
    expect(t.opponent()?.peers[0].view).toBeNull();
    expect(t.opponent()?.peers[1].view?.playerId).toBe('fake-desmond');
  });

  it('pushes nothing on a local change with no fake pod', () => {
    const t = setup();
    t.netplay.localViewChanged(view('alice', 9));
    expect(t.opponents).toHaveLength(0);
  });

  it('moves seq on every change of the fake pod', () => {
    const t = setup();
    t.netplay.setFakeOpponents(1);
    t.netplay.setFakeOpponents(3);
    t.netplay.setFakeOpponents(0);
    const seqs = t.opponents.map((o) => o.seq);
    expect(seqs).toHaveLength(3);
    expect(seqs[1]).toBeGreaterThan(seqs[0]);
    expect(seqs[2]).toBeGreaterThan(seqs[1]);
    expect(t.opponent()?.peers).toEqual([]);
  });

  it('counts fake opponents so the board grows for a pod', () => {
    const t = setup();
    t.netplay.setFakeOpponents(2);
    expect(t.netplay.opponentCount).toBe(2);
    expect(t.netplay.fakeOpponents).toBe(2);
  });

  it('refuses a fake pod while a session is live', async () => {
    const t = await hostWith({ 2: 'bob' });
    expect(t.netplay.setFakeOpponents(3)).toBe(false);
    expect(t.netplay.opponentCount).toBe(1);
    expect(t.opponent()?.peers.map((p) => p.info.playerId)).toEqual(['bob']);
  });

  it('clears fake opponents when hosting or joining', async () => {
    const t = setup();
    t.netplay.setFakeOpponents(3);
    await t.netplay.host();
    expect(t.netplay.fakeOpponents).toBe(0);
    expect(t.opponent()?.peers).toEqual([]);

    const g = setup('bob');
    g.netplay.setFakeOpponents(3);
    const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
    await g.netplay.join(invite);
    await flush();
    expect(g.netplay.fakeOpponents).toBe(0);
    expect(g.opponent()?.peers).toEqual([]);
  });

  it('never puts a fake peer on the wire', async () => {
    const t = setup();
    t.netplay.setFakeOpponents(3);
    const h = await hostWith({ 2: 'bob' });
    h.netplay.localViewChanged(view('alice', 5));
    h.netplay.localLogEntry('drew a card');
    expect(JSON.stringify(h.sends())).not.toContain('fake-');
    expect(h.state().players.map((p) => p.playerId)).toEqual(['alice', 'bob']);
  });
});

describe('Netplay solo', () => {
  it('keeps the local log without anyone to send it to', () => {
    const t = setup();
    t.netplay.localLogEntry('drew a card');
    expect(t.sends()).toHaveLength(0);
    expect(t.opponent()?.log).toMatchObject([
      { kind: 'action', playerName: 'Alice', text: 'drew a card' },
    ]);
  });
});

describe('Netplay relay mode', () => {
  // The host in a lobby, with guests seated and greeted.
  const relayHostWith = async (guests: Record<number, string>) => {
    const t = setup();
    await t.netplay.hostLobby();
    t.netplay.handleReport({ type: 'lobby', seat: 1, code: 'ABC123' });
    for (const [seatKey, id] of Object.entries(guests)) {
      const seat = Number(seatKey);
      t.netplay.handleReport({ type: 'open', seat });
      say(t, seat, hello(id));
    }
    return t;
  };

  it('opens a lobby and waits, with no invite to gather', async () => {
    const t = setup();
    await t.netplay.hostLobby();
    expect(t.relay.retire).toHaveBeenCalled();
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.commands.at(-1)).toEqual({ op: 'hostLobby', slots: 4 });
    expect(t.state()).toMatchObject({
      role: 'host',
      mode: 'relay',
      phase: 'creatingInvite',
      lobbyCode: null,
      status: 'Opening a lobby…',
    });

    t.netplay.handleReport({ type: 'lobby', seat: 1, code: 'ABC123' });
    expect(t.state()).toMatchObject({
      phase: 'awaitingReply',
      lobbyCode: 'ABC123',
      status: 'Share the code. Players join whenever they are ready.',
    });
    // Seats stay empty until someone types the code; none has an invite.
    expect(t.state().seats.map((seat) => seat.phase)).toEqual([
      'empty',
      'empty',
      'empty',
    ]);
    expect(t.state().seats.every((seat) => seat.invite === null)).toBe(true);
  });

  it('greets a guest the moment the relay seats them', async () => {
    const t = await relayHostWith({ 2: 'bob' });
    expect(t.state()).toMatchObject({
      phase: 'connected',
      lobbyCode: 'ABC123',
    });
    expect(t.sentTo(2).map((m) => m.kind)).toEqual([
      'hello',
      'public',
      'roster',
    ]);
    expect(t.state().players).toEqual([
      { playerId: 'alice', name: 'Alice', seat: 1 },
      { playerId: 'bob', name: 'Bob', seat: 2 },
    ]);
  });

  it('relays between guests exactly as a peer-to-peer pod does', async () => {
    const t = await relayHostWith({ 2: 'bob', 3: 'carol' });
    const before = t.sends().length;
    say(t, 2, raw('bob', 9, { kind: 'log', text: 'Bob draws a card.' }));
    const relayed = t.sends().slice(before);
    expect(relayed.map((c) => c.seats)).toEqual([[3]]);
    expect(JSON.parse(relayed[0].data)).toMatchObject({
      from: 'bob',
      kind: 'log',
    });
  });

  it('drops a seat when the relay says it closed', async () => {
    const t = await relayHostWith({ 2: 'bob' });
    t.netplay.handleReport({ type: 'closed', seat: 2 });
    expect(t.state().seats[0]).toMatchObject({ seat: 2, phase: 'empty' });
    expect(t.state().status).toContain('Bob left the game.');
  });

  it('joins by code, normalizing what the player typed', async () => {
    const t = setup('bob');
    await t.netplay.joinLobby('  abc-123 ');
    expect(t.commands.at(-1)).toEqual({ op: 'joinLobby', code: 'ABC123' });
    expect(t.state()).toMatchObject({
      role: 'guest',
      mode: 'relay',
      phase: 'connecting',
      lobbyCode: 'ABC123',
    });
  });

  it('refuses something that is not a code, without a session', async () => {
    const t = setup('bob');
    await t.netplay.joinLobby('nope');
    expect(t.commands).toEqual([]);
    expect(t.state()).toMatchObject({ role: null, error: expect.any(String) });
  });

  it('greets the host once the relay reports the link open', async () => {
    const t = setup('bob');
    await t.netplay.joinLobby('ABC123');
    t.netplay.handleReport({ type: 'lobby', seat: 1, code: 'ABC123' });
    t.netplay.handleReport({ type: 'open', seat: 1 });
    expect(t.state().phase).toBe('connected');
    expect(t.sentTo(1).map((m) => m.kind)).toEqual(['hello', 'public']);
    say(t, 1, hello('alice'));
    expect(t.state().status).toContain('Alice');
  });

  it('ends a guest session when the lobby fails', async () => {
    const t = setup('bob');
    await t.netplay.joinLobby('ABC123');
    t.netplay.handleReport({
      type: 'lobbyFailed',
      seat: 1,
      message: 'That game is already full.',
    });
    expect(t.state()).toMatchObject({
      phase: 'ended',
      error: 'That game is already full.',
    });
  });

  it('ends a connected guest when the lobby goes away', async () => {
    const t = setup('bob');
    await t.netplay.joinLobby('ABC123');
    t.netplay.handleReport({ type: 'lobby', seat: 1, code: 'ABC123' });
    t.netplay.handleReport({ type: 'open', seat: 1 });
    say(t, 1, hello('alice'));
    t.netplay.handleReport({
      type: 'lobbyFailed',
      seat: 1,
      message: 'The relay server is restarting.',
    });
    expect(t.state()).toMatchObject({
      phase: 'ended',
      error: 'The relay server is restarting.',
    });
  });

  it('ends a host session when the lobby never opened', async () => {
    const t = setup();
    await t.netplay.hostLobby();
    t.netplay.handleReport({
      type: 'lobbyFailed',
      seat: 1,
      message: 'No relay server is set.',
    });
    expect(t.state()).toMatchObject({
      phase: 'ended',
      error: 'No relay server is set.',
    });
  });

  it('keeps a running lobby alive when one message fails', async () => {
    const t = await relayHostWith({ 2: 'bob' });
    t.netplay.handleReport({
      type: 'lobbyFailed',
      seat: 1,
      message: 'Could not send.',
    });
    expect(t.state()).toMatchObject({
      phase: 'connected',
      error: 'Could not send.',
    });
  });

  it('kicks a seat through the relay', async () => {
    const t = await relayHostWith({ 2: 'bob' });
    t.netplay.closeSeat(2);
    expect(t.commands.at(-1)).toEqual({ op: 'close', seat: 2 });
  });

  it('stands both transports down when a mode changes', async () => {
    const t = setup();
    await t.netplay.hostLobby();
    t.transport.retire.mockClear();
    t.relay.retire.mockClear();
    await t.netplay.host();
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.relay.retire).toHaveBeenCalled();
    expect(t.state()).toMatchObject({ mode: 'p2p', lobbyCode: null });
  });

  it('takes a lobby code from a deep link without connecting', () => {
    const t = setup('bob');
    expect(t.netplay.receiveLink('mtgplaymat://join?l=ABC123')).toBe(true);
    expect(t.state()).toMatchObject({
      pendingLobbyCode: 'ABC123',
      role: null,
    });
    expect(t.commands).toEqual([]);
  });

  it('still takes a peer-to-peer invite from a deep link', () => {
    const t = setup('bob');
    expect(t.netplay.receiveLink('mtgplaymat://join?c=MPM1:abc')).toBe(true);
    expect(t.state()).toMatchObject({
      pendingInvite: 'MPM1:abc',
      pendingLobbyCode: null,
    });
  });

  it('leaves a lobby by saying goodbye first', async () => {
    const t = await relayHostWith({ 2: 'bob' });
    t.netplay.leave();
    const byes = t
      .sends()
      .filter((c) => (JSON.parse(c.data) as NetMessage).kind === 'bye');
    expect(byes).toHaveLength(1);
    expect(t.state()).toMatchObject({
      role: null,
      mode: null,
      lobbyCode: null,
      phase: 'idle',
    });
  });
});

describe('Netplay play area backgrounds', () => {
  const MAT = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const mat = (id: string, data = 'aGVsbG8=') => ({ id, data });

  const matsTo = (t: Harness, seat: number) =>
    t.sentTo(seat).filter((m) => m.kind === 'mat');

  it('says nothing at all when the player has no background', async () => {
    const t = await hostWith({ 2: 'bob' });
    await flush();
    expect(matsTo(t, 2)).toHaveLength(0);
  });

  it('sends its own to a seat as that seat opens', async () => {
    const t = setup();
    t.setMat(mat(MAT));
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'MPM1:i2' });
    t.netplay.handleReport({ type: 'open', seat: 2 });
    await flush();
    expect(matsTo(t, 2)).toMatchObject([
      { kind: 'mat', id: MAT, data: 'aGVsbG8=' },
    ]);
  });

  it('tells the pod when the player picks another, and when they drop it', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    t.setMat(mat(MAT));
    t.netplay.matChanged();
    await flush();
    expect(matsTo(t, 2)).toMatchObject([{ id: MAT }]);
    expect(matsTo(t, 3)).toMatchObject([{ id: MAT }]);

    t.setMat(null);
    t.netplay.matChanged();
    await flush();
    expect(matsTo(t, 2)).toMatchObject([{ id: MAT }, { id: null, data: null }]);

    // Back to a bare table, so there is nothing left to announce.
    t.netplay.matChanged();
    await flush();
    expect(matsTo(t, 2)).toHaveLength(2);
  });

  it('keeps a guest mat only once its bytes are kept, and shows it', async () => {
    const t = await hostWith({ 2: 'bob' });
    say(t, 2, raw('bob', 50, { kind: 'mat', id: MAT, data: 'aGVsbG8=' }));
    await flush();
    expect(t.keptMats).toEqual([{ id: MAT, data: 'aGVsbG8=' }]);
    expect(t.opponent()?.peers[0]).toMatchObject({ matId: MAT });

    say(t, 2, raw('bob', 51, { kind: 'mat', id: null, data: null }));
    await flush();
    expect(t.opponent()?.peers[0]).toMatchObject({ matId: null });
  });

  it('shows nothing when the bytes do not match the name they came under', async () => {
    const t = await hostWith({ 2: 'bob' });
    t.refuseMats();
    say(t, 2, raw('bob', 50, { kind: 'mat', id: MAT, data: 'bm9wZQ==' }));
    await flush();
    expect(t.keptMats).toHaveLength(1);
    expect(t.opponent()?.peers[0]).toMatchObject({ matId: null });
    expect(t.logged).toContain('warn refused a play area background from=bob');
  });

  it('passes a guest mat on, and keeps it for whoever joins later', async () => {
    const t = await hostWith({ 2: 'bob' });
    const bobMat = raw('bob', 50, { kind: 'mat', id: MAT, data: 'aGVsbG8=' });
    say(t, 2, bobMat);
    await flush();

    // Carol arrives afterwards and is told about it without Bob resending.
    await t.netplay.invite(3);
    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:i3' });
    t.netplay.handleReport({ type: 'open', seat: 3 });
    say(t, 3, hello('carol'));
    await flush();
    expect(matsTo(t, 3)).toMatchObject([{ id: MAT, data: 'aGVsbG8=' }]);

    // And a live one is relayed as it arrives, unaltered.
    const again = raw('bob', 51, { kind: 'mat', id: OTHER, data: 'aGVsbG8=' });
    say(t, 2, again);
    await flush();
    expect(
      t.sends().filter((c) => c.data === again && c.seats.includes(3))
    ).toHaveLength(1);
  });

  it('takes the host mat as a guest', async () => {
    const t = await guestIn();
    say(t, 1, raw('alice', 50, { kind: 'mat', id: MAT, data: 'aGVsbG8=' }));
    await flush();
    expect(t.keptMats).toEqual([{ id: MAT, data: 'aGVsbG8=' }]);
    expect(t.opponent()?.peers[0]).toMatchObject({ matId: MAT });
  });
});

describe('Netplay card backs', () => {
  const BACK = 'c'.repeat(64);
  const MAT = 'a'.repeat(64);
  const backsTo = (t: Harness, seat: number) =>
    t.sentTo(seat).filter((m) => m.kind === 'back');

  it('sends its own beside its mat as a seat opens, and on a change', async () => {
    const t = setup();
    t.setBack({ id: BACK, data: 'aGVsbG8=' });
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', seat: 2, code: 'MPM1:i2' });
    t.netplay.handleReport({ type: 'open', seat: 2 });
    await flush();
    expect(backsTo(t, 2)).toMatchObject([
      { kind: 'back', id: BACK, data: 'aGVsbG8=' },
    ]);
    expect(t.sentTo(2).filter((m) => m.kind === 'mat')).toHaveLength(0);

    t.setBack(null);
    t.netplay.backChanged();
    await flush();
    expect(backsTo(t, 2).at(-1)).toMatchObject({ id: null, data: null });
  });

  it('keeps a guest’s back apart from their mat, and passes it on', async () => {
    const t = await hostWith({ 2: 'bob' });
    const bobBack = raw('bob', 50, {
      kind: 'back',
      id: BACK,
      data: 'aGVsbG8=',
    });
    say(t, 2, bobBack);
    say(t, 2, raw('bob', 51, { kind: 'mat', id: MAT, data: 'aGVsbG8=' }));
    await flush();
    expect(t.keptBacks).toEqual([{ id: BACK, data: 'aGVsbG8=' }]);
    expect(t.keptMats).toEqual([{ id: MAT, data: 'aGVsbG8=' }]);
    expect(t.opponent()?.peers[0]).toMatchObject({ backId: BACK, matId: MAT });

    await t.netplay.invite(3);
    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:i3' });
    t.netplay.handleReport({ type: 'open', seat: 3 });
    say(t, 3, hello('carol'));
    await flush();
    expect(backsTo(t, 3)).toMatchObject([{ id: BACK }]);
  });

  it('takes the host’s back as a guest', async () => {
    const t = await guestIn();
    say(t, 1, raw('alice', 50, { kind: 'back', id: BACK, data: 'aGVsbG8=' }));
    await flush();
    expect(t.opponent()?.peers[0]).toMatchObject({ backId: BACK });
  });
});

describe('Netplay changes of control', () => {
  const card = {
    instanceId: 'alice:3',
    ref: {
      id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      faces: [{ name: 'Grizzly Bears', typeLine: 'Creature — Bear' }],
    },
    isToken: false,
    tapped: false,
    faceDown: true,
    faceIndex: 0,
    counters: {},
  };
  const give: ControlChange = { op: 'give', card };

  const helloWith = (from: string, seq = 1) =>
    raw(from, seq, {
      kind: 'hello',
      playerId: from,
      name: names[from],
      appVersion: '1',
      features: ['control'],
    });

  const publicOf = (from: string, seq: number, v: PublicView | null) =>
    raw(from, seq, { kind: 'public', view: v });

  it('hands a permanent only to a player with a game that can hold it', async () => {
    const t = await hostWith({ 2: 'bob' });
    t.netplay.invite(3);
    t.netplay.handleReport({ type: 'invite', seat: 3, code: 'MPM1:i3' });
    t.netplay.handleReport({ type: 'open', seat: 3 });
    say(t, 3, helloWith('carol'));
    // Bob's build never said it could; Carol has no game open yet.
    expect(t.netplay.canTakeControl('bob')).toBe(false);
    expect(t.netplay.canTakeControl('carol')).toBe(false);
    say(t, 3, publicOf('carol', 2, view('carol')));
    expect(t.netplay.canTakeControl('carol')).toBe(true);
    expect(t.netplay.canTakeControl('dave')).toBe(false);
  });

  it('sends the host’s change to that one seat', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    t.netplay.sendControl('carol', give);
    const sent = t.sends().at(-1);
    expect(sent?.seats).toEqual([3]);
    expect(JSON.parse(sent?.data ?? '')).toMatchObject({
      kind: 'control',
      from: 'alice',
      to: 'carol',
      change: give,
    });
  });

  it('passes a guest’s change on to its seat alone, unchanged', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol', 4: 'dave' });
    const data = raw('bob', 2, {
      kind: 'control',
      to: 'carol',
      change: { ...give, card: { ...card, instanceId: 'bob:3' } },
    });
    say(t, 2, data);
    expect(t.sends().at(-1)).toEqual({ op: 'send', seats: [3], data });
    expect(t.control).toEqual([]);
  });

  it('takes a change meant for the host itself', async () => {
    const t = await hostWith({ 2: 'bob' });
    say(
      t,
      2,
      raw('bob', 2, { kind: 'control', to: 'alice', change: { op: 'recall' } })
    );
    expect(t.control).toEqual([['bob', 'Bob', { op: 'recall' }]]);
  });

  it('refuses a card that is not the sender’s to give', async () => {
    const t = await hostWith({ 2: 'bob' });
    say(t, 2, raw('bob', 2, { kind: 'control', to: 'alice', change: give }));
    expect(t.control).toEqual([]);
  });

  it('as a guest, sends by the host and keeps only its own', async () => {
    const t = await guestIn([
      ['alice', 1],
      ['bob', 2],
      ['carol', 3],
    ]);
    say(t, 1, hello('carol'));
    t.netplay.sendControl('carol', {
      op: 'return',
      instanceId: 'carol:1',
      to: 'graveyard',
      state: { tapped: false, faceDown: false, faceIndex: 0, counters: {} },
    });
    expect(t.sends().at(-1)?.seats).toEqual([1]);

    say(
      t,
      1,
      raw('carol', 2, { kind: 'control', to: 'dave', change: { op: 'recall' } })
    );
    say(
      t,
      1,
      raw('carol', 3, { kind: 'control', to: 'bob', change: { op: 'recall' } })
    );
    expect(t.control).toEqual([['carol', 'Carol', { op: 'recall' }]]);
  });

  it('notices a game going away, whichever way it goes', async () => {
    const t = await hostWith({ 2: 'bob', 3: 'carol' });
    say(t, 2, publicOf('bob', 2, view('bob')));
    say(t, 3, publicOf('carol', 2, view('carol')));
    expect(t.gone).toEqual([]);

    say(t, 2, publicOf('bob', 3, null));
    expect(t.gone).toEqual(['bob Bob']);
    say(t, 3, raw('carol', 3, { kind: 'bye' }));
    expect(t.gone).toEqual(['bob Bob', 'carol Carol']);
  });
});
