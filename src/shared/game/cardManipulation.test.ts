import { describe, expect, it } from 'vitest';

import { canTransform } from './cardRefs';
import { ATTACH_OFFSET, counterNames } from './mtg';
import { reduce, replay } from './reducer';
import { applyAll, cardRef, deepFreeze, startGame, zone } from './testFixtures';
import type { CardRef, GameAction, GameState } from './types';

const P1 = 'p1';

const dfc: CardRef = {
  id: '11bf83bb-c95b-4b4f-9a56-ce7a1816307a',
  name: 'Delver of Secrets // Insectile Aberration',
  typeLine: 'Creature — Human Wizard // Creature — Human Insect',
  layout: 'transform',
  faces: [
    {
      name: 'Delver of Secrets',
      typeLine: 'Creature — Human Wizard',
      power: '1',
      toughness: '1',
    },
    {
      name: 'Insectile Aberration',
      typeLine: 'Creature — Human Insect',
      power: '3',
      toughness: '2',
    },
  ],
};

const soldier: CardRef = {
  id: '1bdb2914-bba2-4cb6-802e-af2aeef46de8',
  name: 'Soldier',
  typeLine: 'Token Creature — Soldier',
  layout: 'token',
  faces: [{ name: 'Soldier', typeLine: 'Token Creature — Soldier' }],
  power: '1',
  toughness: '1',
};

// Draws the whole (small) library and plays the first n hand cards.
const withPermanents = (
  n: number,
  deck: CardRef[] = Array.from({ length: 6 }, (_, i) => cardRef(`c${i}`))
): GameState => {
  const drawn = reduce(startGame([{ id: P1, name: P1, deck }]), {
    type: 'draw',
    playerId: P1,
    count: deck.length,
  });
  return zone(drawn, P1, 'hand')
    .slice(0, n)
    .reduce(
      (state, id) =>
        reduce(state, { type: 'moveCard', instanceId: id, to: 'battlefield' }),
      drawn
    );
};

const field = (state: GameState) =>
  zone(state, P1, 'battlefield').map((id) => state.cards[id]);

describe('adjustCounter', () => {
  it('adds and removes counters, dropping empty ones', () => {
    const state = withPermanents(1);
    const [card] = field(state);
    const add: GameAction = {
      type: 'adjustCounter',
      instanceId: card.instanceId,
      counter: 'charge',
      delta: 3,
    };

    const added = reduce(deepFreeze(state), add);
    expect(added.cards[card.instanceId].counters).toEqual({ charge: 3 });

    const removed = reduce(added, { ...add, delta: -5 });
    expect(removed.cards[card.instanceId].counters).toEqual({});
    // Removing from nothing changes nothing and isn't logged.
    expect(reduce(removed, { ...add, delta: -1 })).toBe(removed);
  });

  it('annihilates +1/+1 and -1/-1 counters in pairs', () => {
    const state = withPermanents(1);
    const [card] = field(state);
    const next = applyAll(state, [
      {
        type: 'adjustCounter',
        instanceId: card.instanceId,
        counter: counterNames.plusOne,
        delta: 3,
      },
      {
        type: 'adjustCounter',
        instanceId: card.instanceId,
        counter: counterNames.minusOne,
        delta: 1,
      },
    ]);
    expect(next.cards[card.instanceId].counters).toEqual({ '+1/+1': 2 });

    const flipped = reduce(next, {
      type: 'adjustCounter',
      instanceId: card.instanceId,
      counter: counterNames.minusOne,
      delta: 4,
    });
    expect(flipped.cards[card.instanceId].counters).toEqual({ '-1/-1': 2 });
  });

  it('works in exile but not in hidden zones, and clears on zone change', () => {
    const state = withPermanents(1);
    const [card] = field(state);
    const handCard = zone(state, P1, 'hand')[0];
    expect(
      reduce(state, {
        type: 'adjustCounter',
        instanceId: handCard,
        counter: 'time',
        delta: 1,
      })
    ).toBe(state);

    const exiled = applyAll(state, [
      { type: 'moveCard', instanceId: card.instanceId, to: 'exile' },
      {
        type: 'adjustCounter',
        instanceId: card.instanceId,
        counter: 'time',
        delta: 4,
      },
    ]);
    expect(exiled.cards[card.instanceId].counters).toEqual({ time: 4 });

    const cast = reduce(exiled, {
      type: 'moveCard',
      instanceId: card.instanceId,
      to: 'battlefield',
    });
    expect(cast.cards[card.instanceId].counters).toEqual({});
  });
});

describe('planeswalker loyalty', () => {
  const jace: CardRef = {
    id: '0e606072-a3aa-4300-ba90-ec92a721fa76',
    name: 'Jace, the Mind Sculptor',
    typeLine: 'Legendary Planeswalker — Jace',
    faces: [
      {
        name: 'Jace, the Mind Sculptor',
        typeLine: 'Legendary Planeswalker — Jace',
      },
    ],
    loyalty: '3',
  };
  const valki: CardRef = {
    id: 'ea7e4c65-b4c4-4795-9475-3cba71c50ea5',
    name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
    typeLine: 'Legendary Creature — God // Legendary Planeswalker — Tibalt',
    layout: 'modal_dfc',
    faces: [
      {
        name: 'Valki, God of Lies',
        typeLine: 'Legendary Creature — God',
        power: '2',
        toughness: '1',
      },
      {
        name: 'Tibalt, Cosmic Impostor',
        typeLine: 'Legendary Planeswalker — Tibalt',
        loyalty: '5',
      },
    ],
  };

  const inHand = (deck: CardRef[]) =>
    reduce(startGame([{ id: P1, name: P1, deck }]), {
      type: 'draw',
      playerId: P1,
      count: deck.length,
    });

  it('enters with its printed loyalty as counters', () => {
    const state = inHand([jace]);
    const [id] = zone(state, P1, 'hand');
    const played = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
    });
    expect(played.cards[id].counters).toEqual({ loyalty: 3 });

    const used = reduce(played, {
      type: 'adjustCounter',
      instanceId: id,
      counter: counterNames.loyalty,
      delta: -2,
    });
    expect(used.cards[id].counters).toEqual({ loyalty: 1 });
    const copied = reduce(used, { type: 'copyCard', instanceId: id });
    expect(field(copied).at(-1)?.counters).toEqual({ loyalty: 3 });
  });

  it('uses the face it enters on, and none face down', () => {
    const state = inHand([valki, valki]);
    const [front, back] = zone(state, P1, 'hand');
    const played = applyAll(state, [
      { type: 'moveCard', instanceId: front, to: 'battlefield' },
      { type: 'moveCard', instanceId: back, to: 'battlefield', faceIndex: 1 },
    ]);
    expect(played.cards[front].counters).toEqual({});
    expect(played.cards[back].counters).toEqual({ loyalty: 5 });

    const hidden = reduce(inHand([jace]), {
      type: 'moveCard',
      instanceId: zone(inHand([jace]), P1, 'hand')[0],
      to: 'battlefield',
      faceDown: true,
    });
    expect(field(hidden)[0].counters).toEqual({});
  });
});

describe('adjustPlayerCounter', () => {
  it('tracks poison and friends, never below zero', () => {
    const state = startGame();
    const next = applyAll(state, [
      {
        type: 'adjustPlayerCounter',
        playerId: P1,
        counter: 'poison',
        delta: 2,
      },
      {
        type: 'adjustPlayerCounter',
        playerId: P1,
        counter: 'energy',
        delta: 3,
      },
      {
        type: 'adjustPlayerCounter',
        playerId: P1,
        counter: 'energy',
        delta: -5,
      },
    ]);
    expect(next.players[0].counters).toEqual({ poison: 2 });
    expect(
      reduce(next, {
        type: 'adjustPlayerCounter',
        playerId: 'nobody',
        counter: 'poison',
        delta: 1,
      })
    ).toBe(next);
  });
});

describe('createTokens', () => {
  it('creates N cascaded tokens that vanish when they leave', () => {
    const state = withPermanents(1);
    const next = reduce(deepFreeze(state), {
      type: 'createTokens',
      playerId: P1,
      ref: soldier,
      count: 2,
    });

    const tokens = field(next).filter((card) => card.isToken);
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map((t) => t.instanceId)).size).toBe(2);
    expect(tokens.every((t) => !(t.instanceId in state.cards))).toBe(true);
    expect(tokens[0]).toMatchObject({
      ref: soldier,
      owner: P1,
      controller: P1,
      zone: 'battlefield',
      attachedTo: null,
    });
    expect(tokens[0].position).not.toEqual(tokens[1].position);
    expect(next.nextInstanceId).toBe(state.nextInstanceId + 2);

    for (const to of ['graveyard', 'hand', 'exile', 'library'] as const) {
      const gone = reduce(next, {
        type: 'moveCard',
        instanceId: tokens[0].instanceId,
        to,
      });
      expect(gone.cards[tokens[0].instanceId]).toBeUndefined();
      expect(zone(gone, P1, to)).not.toContain(tokens[0].instanceId);
      expect(zone(gone, P1, 'battlefield')).toHaveLength(2);
    }
  });

  it('accepts a custom token and replays deterministically', () => {
    const custom: CardRef = {
      id: '',
      custom: true,
      name: 'Zombie Army',
      typeLine: 'Token Creature — Zombie Army',
      faces: [
        { name: 'Zombie Army', typeLine: 'Token Creature — Zombie Army' },
      ],
      power: '0',
      toughness: '0',
    };
    const next = reduce(startGame(), {
      type: 'createTokens',
      playerId: P1,
      ref: custom,
      count: 1,
    });
    expect(field(next)[0].ref).toEqual(custom);
    expect(replay(next.log)).toEqual(next);
  });
});

describe('copyCard', () => {
  it('makes a token with the same ref and face', () => {
    const state = withPermanents(1, [dfc]);
    const [card] = field(state);
    const next = applyAll(state, [
      { type: 'transform', instanceId: card.instanceId },
      { type: 'copyCard', instanceId: card.instanceId },
    ]);
    const [, copy] = field(next);
    expect(copy).toMatchObject({
      ref: dfc,
      faceIndex: 1,
      isToken: true,
      zone: 'battlefield',
    });
    expect(copy.instanceId).not.toBe(card.instanceId);
  });
});

describe('copyCard of a commander', () => {
  it('copies the card but not its commander identity or tax', () => {
    let state = startGame([
      {
        id: P1,
        name: P1,
        deck: [],
        command: [cardRef('Commander', 'cmdr-id')],
      },
    ]);
    const [id] = zone(state, P1, 'command');
    state = reduce(state, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
    });
    state = reduce(state, {
      type: 'adjustCommanderCasts',
      instanceId: id,
      delta: 1,
    });
    expect(state.cards[id]).toMatchObject({
      isCommander: true,
      commanderCasts: 1,
    });

    const copied = reduce(state, { type: 'copyCard', instanceId: id });
    const copy = field(copied).at(-1)!;
    expect(copy.instanceId).not.toBe(id);
    expect(copy.ref).toEqual(state.cards[id].ref);
    expect(copy.isToken).toBe(true);
    expect(copy.isCommander).toBeUndefined();
    expect(copy.commanderCasts).toBeUndefined();

    // A copy leaving the battlefield just ceases to exist.
    const gone = reduce(copied, {
      type: 'moveCard',
      instanceId: copy.instanceId,
      to: 'command',
    });
    expect(gone.cards[copy.instanceId]).toBeUndefined();
    expect(zone(gone, P1, 'command')).toEqual([]);
  });
});

describe('setFaceDown', () => {
  it('turns a permanent face down and back up to its front', () => {
    const state = withPermanents(1, [dfc]);
    const [card] = field(state);
    const down = applyAll(state, [
      { type: 'transform', instanceId: card.instanceId },
      { type: 'setFaceDown', instanceId: card.instanceId, faceDown: true },
    ]);
    expect(down.cards[card.instanceId]).toMatchObject({
      faceDown: true,
      faceIndex: 0,
    });
    expect(
      reduce(down, {
        type: 'setFaceDown',
        instanceId: card.instanceId,
        faceDown: true,
      })
    ).toBe(down);
    // Face-down permanents can't transform.
    expect(
      reduce(down, { type: 'transform', instanceId: card.instanceId })
    ).toBe(down);

    const up = reduce(down, {
      type: 'setFaceDown',
      instanceId: card.instanceId,
      faceDown: false,
    });
    expect(up.cards[card.instanceId].faceDown).toBe(false);
  });

  it('plays a card face down from hand, and it is face up once it leaves', () => {
    const drawn = reduce(startGame(), { type: 'draw', playerId: P1, count: 1 });
    const [id] = zone(drawn, P1, 'hand');
    const played = reduce(drawn, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
      faceDown: true,
    });
    expect(played.cards[id]).toMatchObject({
      zone: 'battlefield',
      faceDown: true,
    });

    const died = reduce(played, {
      type: 'moveCard',
      instanceId: id,
      to: 'graveyard',
    });
    expect(died.cards[id].faceDown).toBe(false);
  });
});

describe('transform', () => {
  it('cycles faces of a DFC and resets when it leaves', () => {
    const state = withPermanents(1, [dfc]);
    const [card] = field(state);
    const once = reduce(state, {
      type: 'transform',
      instanceId: card.instanceId,
    });
    expect(once.cards[card.instanceId].faceIndex).toBe(1);
    const twice = reduce(once, {
      type: 'transform',
      instanceId: card.instanceId,
    });
    expect(twice.cards[card.instanceId].faceIndex).toBe(0);

    const bounced = reduce(once, {
      type: 'moveCard',
      instanceId: card.instanceId,
      to: 'hand',
    });
    expect(bounced.cards[card.instanceId].faceIndex).toBe(0);
  });

  it('refuses single-faced and split-like cards', () => {
    const state = withPermanents(1);
    const [card] = field(state);
    expect(
      reduce(state, { type: 'transform', instanceId: card.instanceId })
    ).toBe(state);
    expect(canTransform({ ...dfc, layout: 'adventure' })).toBe(false);
    expect(canTransform({ ...dfc, layout: 'modal_dfc' })).toBe(true);
    expect(canTransform({ ...dfc, layout: undefined })).toBe(true);
  });

  it('plays a modal DFC as its back face', () => {
    const mdfc = { ...dfc, layout: 'modal_dfc' };
    const drawn = reduce(startGame([{ id: P1, name: P1, deck: [mdfc] }]), {
      type: 'draw',
      playerId: P1,
      count: 1,
    });
    const [id] = zone(drawn, P1, 'hand');
    const played = reduce(drawn, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
      faceIndex: 1,
    });
    expect(played.cards[id].faceIndex).toBe(1);
    // An out-of-range face is ignored.
    const bad = reduce(drawn, {
      type: 'moveCard',
      instanceId: id,
      to: 'battlefield',
      faceIndex: 3,
    });
    expect(bad.cards[id].faceIndex).toBe(0);
  });
});

describe('attach', () => {
  const setup = () => {
    const state = withPermanents(3);
    const [host, aura, equipment] = field(state);
    return { state, host, aura, equipment };
  };

  it('stacks attachments behind their host at an offset', () => {
    const { state, host, aura, equipment } = setup();
    const next = applyAll(state, [
      { type: 'attach', instanceId: aura.instanceId, to: host.instanceId },
      { type: 'attach', instanceId: equipment.instanceId, to: host.instanceId },
    ]);
    const base = host.position!;
    expect(next.cards[aura.instanceId]).toMatchObject({
      attachedTo: host.instanceId,
      position: { x: base.x + ATTACH_OFFSET.x, y: base.y + ATTACH_OFFSET.y },
    });
    expect(next.cards[equipment.instanceId].position).toEqual({
      x: base.x + 2 * ATTACH_OFFSET.x,
      y: base.y + 2 * ATTACH_OFFSET.y,
    });
  });

  it('refuses self, loops, and hosts off the battlefield', () => {
    const { state, host, aura } = setup();
    const attached = reduce(state, {
      type: 'attach',
      instanceId: aura.instanceId,
      to: host.instanceId,
    });
    expect(
      reduce(attached, {
        type: 'attach',
        instanceId: host.instanceId,
        to: aura.instanceId,
      })
    ).toBe(attached);
    expect(
      reduce(state, {
        type: 'attach',
        instanceId: aura.instanceId,
        to: aura.instanceId,
      })
    ).toBe(state);
    const inHand = zone(state, P1, 'hand')[0];
    expect(
      reduce(state, { type: 'attach', instanceId: aura.instanceId, to: inHand })
    ).toBe(state);
  });

  it('moves attachments with the host', () => {
    const { state, host, aura } = setup();
    const attached = reduce(state, {
      type: 'attach',
      instanceId: aura.instanceId,
      to: host.instanceId,
    });
    const before = attached.cards[aura.instanceId].position!;
    const moved = reduce(attached, {
      type: 'setPosition',
      instanceId: host.instanceId,
      position: { x: host.position!.x + 100, y: host.position!.y + 50 },
    });
    expect(moved.cards[aura.instanceId]).toMatchObject({
      attachedTo: host.instanceId,
      position: { x: before.x + 100, y: before.y + 50 },
    });
  });

  it('detaches when the attachment is dragged away on its own', () => {
    const { state, host, aura } = setup();
    const attached = reduce(state, {
      type: 'attach',
      instanceId: aura.instanceId,
      to: host.instanceId,
    });
    const moved = reduce(attached, {
      type: 'setPosition',
      instanceId: aura.instanceId,
      position: { x: 400, y: 300 },
    });
    expect(moved.cards[aura.instanceId].attachedTo).toBeNull();
    expect(moved.cards[host.instanceId].position).toEqual(host.position);
  });

  it('detaches on request and leaves attachments when the host leaves', () => {
    const { state, host, aura } = setup();
    const attached = reduce(state, {
      type: 'attach',
      instanceId: aura.instanceId,
      to: host.instanceId,
    });
    const detached = reduce(attached, {
      type: 'attach',
      instanceId: aura.instanceId,
      to: null,
    });
    expect(detached.cards[aura.instanceId].attachedTo).toBeNull();
    expect(zone(detached, P1, 'battlefield').at(-1)).toBe(aura.instanceId);
    expect(
      reduce(detached, {
        type: 'attach',
        instanceId: aura.instanceId,
        to: null,
      })
    ).toBe(detached);

    const died = reduce(attached, {
      type: 'moveCard',
      instanceId: host.instanceId,
      to: 'graveyard',
    });
    expect(died.cards[aura.instanceId]).toMatchObject({
      zone: 'battlefield',
      attachedTo: null,
    });
  });

  it('detaches from a token host that ceases to exist', () => {
    const { state, aura } = setup();
    const withToken = reduce(state, {
      type: 'createTokens',
      playerId: P1,
      ref: soldier,
      count: 1,
    });
    const token = field(withToken).at(-1)!;
    const next = applyAll(withToken, [
      { type: 'attach', instanceId: aura.instanceId, to: token.instanceId },
      { type: 'moveCard', instanceId: token.instanceId, to: 'graveyard' },
    ]);
    expect(next.cards[token.instanceId]).toBeUndefined();
    expect(next.cards[aura.instanceId].attachedTo).toBeNull();
  });

  it('clears attachedTo when the attachment itself leaves', () => {
    const { state, host, aura } = setup();
    const next = applyAll(state, [
      { type: 'attach', instanceId: aura.instanceId, to: host.instanceId },
      { type: 'moveCard', instanceId: aura.instanceId, to: 'hand' },
      { type: 'moveCard', instanceId: aura.instanceId, to: 'battlefield' },
    ]);
    expect(next.cards[aura.instanceId].attachedTo).toBeNull();
  });
});
