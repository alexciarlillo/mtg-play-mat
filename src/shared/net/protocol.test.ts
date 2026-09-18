// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { publicView, type PublicView } from '../game';
import { applyAll, startGame, zone } from '../game/testFixtures';
import type { CardRef, GameState } from '../game/types';
import {
  encodeNetMessage,
  MAX_MESSAGE_BYTES,
  namespaceView,
  type NetMessage,
  parseNetMessage,
  parsePublicView,
} from './protocol';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const deck: CardRef[] = Array.from({ length: 10 }, (_, i) => ({
  id: uuid(i),
  name: `Card ${i}`,
  typeLine: 'Creature — Test',
  faces: [{ name: `Card ${i}`, typeLine: 'Creature — Test', power: '2' }],
  power: '2',
  toughness: '2',
}));

const game = (): GameState => {
  let state = startGame([{ id: 'alice', name: 'Alice', deck }], 3);
  state = applyAll(state, [{ type: 'draw', playerId: 'alice', count: 4 }]);
  const [a, b] = zone(state, 'alice', 'hand');
  return applyAll(state, [
    {
      type: 'moveCard',
      instanceId: a,
      to: 'battlefield',
      position: { x: 5, y: 9 },
    },
    { type: 'toggleTap', instanceId: a },
    { type: 'moveCard', instanceId: b, to: 'graveyard' },
  ]);
};

const view = (): PublicView => {
  const v = publicView(game(), 'alice');
  if (!v) throw new Error('no view');
  return v;
};

const message = (payload: Record<string, unknown>) =>
  JSON.stringify({ v: 1, seq: 1, from: 'alice', ...payload });

describe('net messages', () => {
  it('round-trips hello, public, and bye', () => {
    const messages: NetMessage[] = [
      {
        v: 1,
        seq: 1,
        from: 'alice',
        kind: 'hello',
        playerId: 'alice',
        name: 'Alice',
        appVersion: '0.1.0',
      },
      { v: 1, seq: 2, from: 'alice', kind: 'public', view: view() },
      { v: 1, seq: 3, from: 'alice', kind: 'public', view: null },
      { v: 1, seq: 4, from: 'alice', kind: 'bye' },
    ];
    for (const m of messages) {
      expect(parseNetMessage(encodeNetMessage(m))).toEqual(m);
    }
  });

  it.each([
    ['non-string input', 42],
    ['non-JSON', 'nope'],
    ['an array', '[]'],
    [
      'a wrong version',
      JSON.stringify({ v: 2, seq: 1, from: 'a', kind: 'bye' }),
    ],
    ['a zero seq', JSON.stringify({ v: 1, seq: 0, from: 'a', kind: 'bye' })],
    ['a missing sender', JSON.stringify({ v: 1, seq: 1, kind: 'bye' })],
    ['an unknown kind', message({ kind: 'event' })],
    [
      'a hello for someone else',
      message({ kind: 'hello', playerId: 'bob', name: 'B', appVersion: '1' }),
    ],
    [
      'a view for someone else',
      message({ kind: 'public', view: { ...view(), playerId: 'bob' } }),
    ],
    ['a missing view', message({ kind: 'public' })],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseNetMessage(raw)).toThrow(/bad message/);
  });

  it('caps the message size', () => {
    const big = message({ kind: 'bye', pad: 'x'.repeat(MAX_MESSAGE_BYTES) });
    expect(() => parseNetMessage(big)).toThrow(/larger than/);
    // Multi-byte text is measured in bytes, not characters.
    const wide = message({
      kind: 'bye',
      pad: '€'.repeat(MAX_MESSAGE_BYTES / 3),
    });
    expect(wide.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(() => parseNetMessage(wide)).toThrow(/larger than/);
  });
});

describe('public view validation', () => {
  it('keeps only known fields', () => {
    const v = view();
    const card = { ...v.zones.battlefield[0], evil: '<script>' };
    const parsed = parsePublicView({
      ...v,
      extra: true,
      zones: { ...v.zones, battlefield: [card], library: [card] },
    });
    expect(parsed).toEqual(v);
    expect(JSON.stringify(parsed)).not.toMatch(/evil|extra|"library"/);
  });

  it('hides the identity of face-down cards whatever the peer sends', () => {
    const v = view();
    const card = { ...v.zones.battlefield[0], faceDown: true, faceIndex: 1 };
    const parsed = parsePublicView({
      ...v,
      zones: { ...v.zones, battlefield: [card] },
    });
    expect(parsed.zones.battlefield[0].ref).toBeNull();
    expect(parsed.zones.battlefield[0].faceIndex).toBe(0);
  });

  it.each([
    [
      'a non-Scryfall image id',
      (v: PublicView) => {
        v.zones.battlefield[0].ref!.id = '../../etc/passwd';
      },
    ],
    [
      'a card in the wrong zone',
      (v: PublicView) => {
        v.zones.graveyard[0].zone = 'battlefield';
      },
    ],
    [
      'a non-finite position',
      (v: PublicView) => {
        v.zones.battlefield[0].position = { x: Number.NaN, y: 0 };
      },
    ],
    [
      'a fractional life total',
      (v: PublicView) => {
        v.life = 1.5;
      },
    ],
    [
      'a huge hand count',
      (v: PublicView) => {
        v.handCount = 1e9;
      },
    ],
    [
      'a negative commander tax',
      (v: PublicView) => {
        Object.assign(v.zones.battlefield[0], {
          isCommander: true,
          commanderCasts: -1,
        });
      },
    ],
    [
      'a non-boolean commander flag',
      (v: PublicView) => {
        Object.assign(v.zones.battlefield[0], { isCommander: 'yes' });
      },
    ],
    [
      'negative commander damage',
      (v: PublicView) => {
        v.commanderDamage = [{ source: 's', name: 'S', damage: -1 }];
      },
    ],
    [
      'a commander damage entry without a name',
      (v: PublicView) => {
        v.commanderDamage = [{ source: 's', name: '', damage: 1 }];
      },
    ],
    [
      'too many dummies',
      (v: PublicView) => {
        v.dummies = Array.from({ length: 9 }, (_, i) => ({
          id: `d${i}`,
          name: 'D',
          life: 20,
          commanderDamage: [],
        }));
      },
    ],
    [
      'too many cards',
      (v: PublicView) => {
        v.zones.exile = Array.from({ length: 501 }, () => v.zones.graveyard[0]);
        v.zones.exile.forEach((c) => (c.zone = 'exile'));
      },
    ],
  ])('rejects %s', (_label, corrupt) => {
    const v = structuredClone(view());
    corrupt(v);
    expect(() => parsePublicView(JSON.parse(JSON.stringify(v)))).toThrow(
      /bad message/
    );
  });

  it('keeps commander flags, tax, damage, and dummies', () => {
    const commander = { ...deck[0], id: uuid(99), name: 'Atraxa' };
    let state = startGame(
      [{ id: 'alice', name: 'Alice', deck, command: [commander] }],
      3
    );
    const [id] = zone(state, 'alice', 'command');
    state = applyAll(state, [
      { type: 'moveCard', instanceId: id, to: 'battlefield' },
      { type: 'addDummy', playerId: 'alice', name: 'Dummy' },
      {
        type: 'adjustCommanderDamage',
        playerId: 'alice',
        source: 'bob/bob:0',
        sourceName: 'Tymna',
        delta: 4,
      },
      {
        type: 'adjustCommanderDamage',
        playerId: 'alice',
        dummyId: 'dummy-1',
        source: id,
        sourceName: 'Atraxa',
        delta: 6,
      },
    ]);
    const v = publicView(state, 'alice')!;
    expect(v.zones.battlefield[0]).toMatchObject({
      isCommander: true,
      commanderCasts: 1,
    });
    const parsed = parseNetMessage(
      encodeNetMessage({ v: 1, seq: 1, from: 'alice', kind: 'public', view: v })
    );
    expect(parsed).toMatchObject({ view: v });
    if (parsed.kind === 'public') expect(parsed.view).toEqual(v);
  });

  it('accepts views without commander fields', () => {
    const v: Partial<PublicView> = structuredClone(view());
    delete v.commanderDamage;
    delete v.dummies;
    expect(parsePublicView(v)).toMatchObject({
      commanderDamage: [],
      dummies: [],
    });
  });

  it('drops a false commander flag', () => {
    const v = view();
    const card = { ...v.zones.battlefield[0], isCommander: false };
    const parsed = parsePublicView({
      ...v,
      zones: { ...v.zones, battlefield: [card] },
    });
    expect('isCommander' in parsed.zones.battlefield[0]).toBe(false);
  });

  it('namespaces instance ids by peer', () => {
    const v = view();
    const spaced = namespaceView(v, 'peer-1');
    const ids = Object.values(spaced.zones)
      .flat()
      .map((c) => c.instanceId);
    expect(ids.length).toBeGreaterThan(0);
    ids.forEach((id) => expect(id.startsWith('peer-1/')).toBe(true));
    expect(v.zones.battlefield[0].instanceId.startsWith('peer-1/')).toBe(false);
  });
});
