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
});

const setup = () => {
  const commands: NetCommand[] = [];
  const states: NetState[] = [];
  const opponents: OpponentState[] = [];
  const transport = {
    open: vi.fn(() => Promise.resolve(true)),
    send: (command: NetCommand) => commands.push(command),
    retire: vi.fn(),
  };
  let local: PublicView | null = view('alice');
  const netplay = new Netplay({
    transport,
    config: { iceServers: [], recordWire: false },
    appVersion: '9.9.9',
    profile: () => ({ playerId: 'alice', displayName: 'Alice' }),
    localView: () => local,
    pushState: (s) => states.push(s),
    pushOpponent: (s) => opponents.push(s),
    connectTimeoutMs: 50,
  });
  const sent = () =>
    commands
      .filter((c): c is Extract<NetCommand, { op: 'send' }> => c.op === 'send')
      .map((c) => JSON.parse(c.data) as NetMessage);
  return {
    netplay,
    transport,
    commands,
    sent,
    opponents,
    state: () => netplay.netState,
    setLocal: (v: PublicView | null) => {
      local = v;
    },
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fromBob = (payload: Record<string, unknown>, seq: number) =>
  JSON.stringify({ v: 1, seq, from: 'bob', ...payload });

const connect = async (t: ReturnType<typeof setup>) => {
  await t.netplay.host();
  t.netplay.handleReport({ type: 'invite', code: 'MPM1:invite' });
  t.netplay.handleReport({ type: 'open' });
  t.netplay.handleReport({
    type: 'message',
    data: fromBob(
      { kind: 'hello', playerId: 'bob', name: 'Bob', appVersion: '1' },
      1
    ),
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Netplay', () => {
  it('hosts: opens a fresh transport and shows the invite', async () => {
    const t = setup();
    await t.netplay.host();
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.commands.at(-1)).toMatchObject({ op: 'host' });
    expect(t.state()).toMatchObject({ role: 'host', phase: 'creatingInvite' });

    t.netplay.handleReport({ type: 'invite', code: 'MPM1:abc' });
    expect(t.state()).toMatchObject({
      phase: 'awaitingReply',
      invite: 'MPM1:abc',
    });
  });

  it('explains a pasted invite where a reply belongs', async () => {
    const t = setup();
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', code: 'x' });
    const invite = await packDescription({ type: 'offer', sdp: 'v=0' });
    await t.netplay.acceptReply(invite);
    expect(t.state().error).toMatch(/invite, not a reply/);
    expect(t.commands.some((c) => c.op === 'acceptReply')).toBe(false);

    await t.netplay.acceptReply('garbage');
    expect(t.state().error).toMatch(/not an MTG Play Mat code/);
  });

  it('times out a host that never connects with a friendly error', async () => {
    const t = setup();
    await t.netplay.host();
    t.netplay.handleReport({ type: 'invite', code: 'x' });
    const reply = await packDescription({ type: 'answer', sdp: 'v=0' });
    await t.netplay.acceptReply(`  ${reply}\n`);
    expect(t.commands.at(-1)).toEqual({ op: 'acceptReply', code: reply });
    expect(t.state().phase).toBe('connecting');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(t.state()).toMatchObject({ phase: 'awaitingReply' });
    expect(t.state().error).toMatch(/Could not find a route/);
  });

  it('joins from a link and clears the pending invite', async () => {
    const t = setup();
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
    t.netplay.handleReport({ type: 'reply', code: 'MPM1:r' });
    expect(t.state()).toMatchObject({ phase: 'awaitingHost', reply: 'MPM1:r' });
  });

  it('says hello and sends its public view when the channel opens', async () => {
    const t = setup();
    await connect(t);
    const [hello, pub] = t.sent();
    expect(hello).toEqual({
      v: 1,
      seq: 1,
      from: 'alice',
      kind: 'hello',
      playerId: 'alice',
      name: 'Alice',
      appVersion: '9.9.9',
    });
    expect(pub).toMatchObject({ seq: 2, kind: 'public', view: view('alice') });
    expect(t.state()).toMatchObject({
      phase: 'connected',
      status: 'Connected to Bob.',
      peer: { name: 'Bob' },
    });
  });

  it('streams local changes and shows validated peer views', async () => {
    const t = setup();
    await connect(t);
    t.netplay.localViewChanged(view('alice', 17));
    expect(t.sent().at(-1)).toMatchObject({ seq: 3, view: { life: 17 } });

    t.netplay.handleReport({
      type: 'message',
      data: fromBob({ kind: 'public', view: view('bob', 12) }, 2),
    });
    expect(t.opponents.at(-1)?.view?.life).toBe(12);

    // Stale, malformed, and oversized messages change nothing.
    const before = t.opponents.length;
    for (const data of [
      fromBob({ kind: 'public', view: view('bob', 1) }, 2),
      fromBob({ kind: 'public', view: { life: 'lots' } }, 3),
      'x'.repeat(300_000),
    ]) {
      t.netplay.handleReport({ type: 'message', data });
    }
    expect(t.opponents).toHaveLength(before);
  });

  it('resends hello and the current view on request', async () => {
    const t = setup();
    await connect(t);
    t.setLocal(view('alice', 5));
    t.netplay.resend();
    expect(t.sent().slice(-2)).toMatchObject([
      { kind: 'hello' },
      { kind: 'public', view: { life: 5 } },
    ]);
  });

  it('clears the opponent when they leave or the channel closes', async () => {
    const t = setup();
    await connect(t);
    t.netplay.handleReport({
      type: 'message',
      data: fromBob({ kind: 'public', view: view('bob') }, 2),
    });
    t.netplay.handleReport({
      type: 'message',
      data: fromBob({ kind: 'bye' }, 3),
    });
    expect(t.opponents.at(-1)).toMatchObject({ peer: null, view: null });
    expect(t.state()).toMatchObject({
      phase: 'ended',
      status: 'Bob left the game.',
    });

    const u = setup();
    await connect(u);
    u.netplay.handleReport({ type: 'closed' });
    expect(u.opponents.at(-1)).toMatchObject({ peer: null });
    expect(u.state().phase).toBe('ended');
  });

  it('says goodbye and retires the transport on leave', async () => {
    const t = setup();
    await connect(t);
    t.transport.retire.mockClear();
    t.netplay.leave();
    expect(t.sent().at(-1)).toMatchObject({ kind: 'bye' });
    expect(t.commands.at(-1)).toEqual({ op: 'leave' });
    expect(t.transport.retire).toHaveBeenCalled();
    expect(t.state()).toMatchObject({ role: null, phase: 'idle' });
    expect(t.opponents.at(-1)).toMatchObject({ peer: null });
  });

  it('ignores malformed reports from the net window', () => {
    const t = setup();
    t.netplay.handlers.netReport({ type: 'invite' } as never);
    t.netplay.handlers.netReport('nope' as never);
    expect(t.state().phase).toBe('idle');
  });
});
