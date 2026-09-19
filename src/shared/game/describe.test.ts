import { describe, expect, it } from 'vitest';

import { describeAction, describeStep } from './describe';
import { reduce } from './reducer';
import { applyAll, cardRef, startGame, zone } from './testFixtures';
import type { CardRef, GameAction, GameState, ZoneId } from './types';
import { publicView } from './views';

const P1 = 'p1';

// Every card has a distinct name that no other name contains, so a leak
// of any one of them shows up as a plain substring.
const secretDeck: CardRef[] = Array.from({ length: 20 }, (_, i) =>
  cardRef(`Secret${String.fromCharCode(65 + i)}x`, `secret-id-${i}`)
);

const opening = (): GameState =>
  applyAll(
    startGame(
      [
        {
          id: P1,
          name: 'Alice',
          deck: secretDeck,
          command: [cardRef('Public Commander', 'commander-id')],
        },
      ],
      9
    ),
    [
      { type: 'shuffle', playerId: P1 },
      { type: 'draw', playerId: P1, count: 7 },
    ]
  );

const ids = (state: GameState, name: ZoneId) => zone(state, P1, name);

const nameOf = (state: GameState, id: string) => state.cards[id].ref.name;

// Names a viewer of either public view could know: anything in a public
// zone (face up) or revealed, before or after the step.
const publicNames = (state: GameState): Set<string> => {
  const view = publicView(state, P1);
  if (!view) return new Set();
  const shown = Object.values(view.zones)
    .flat()
    .flatMap((card) => (card.ref ? [card.ref.name] : []));
  const revealed = (view.revealed?.cards ?? []).map((ref) => ref.name);
  return new Set([...shown, ...revealed]);
};

// Applies the action and checks its text names no card that was hidden
// both before and after it.
const step = (state: GameState, action: GameAction, anyHidden = true) => {
  const next = reduce(state, action);
  expect(next).not.toBe(state);
  const text = describeStep(state, action, next, P1);
  const known = new Set([...publicNames(state), ...publicNames(next)]);
  const secret = secretDeck
    .map((ref) => ref.name)
    .filter((name) => !known.has(name));
  if (anyHidden) expect(secret.length).toBeGreaterThan(0);
  for (const name of secret) expect(text ?? '').not.toContain(name);
  // Nor any instance or printing id.
  expect(text ?? '').not.toMatch(/secret-id|c\d+\b/);
  return { next, text };
};

describe('describeAction privacy', () => {
  it('counts drawn cards without naming them', () => {
    const state = opening();
    const { text } = step(state, { type: 'draw', playerId: P1, count: 2 });
    expect(text).toBe('drew 2 cards');
    const one = step(state, { type: 'draw', playerId: P1, count: 1 });
    expect(one.text).toBe('drew a card');
  });

  it('names milled cards, which are public once in the graveyard', () => {
    const state = opening();
    const top = ids(state, 'library').slice(0, 2);
    const { text } = step(state, { type: 'mill', playerId: P1, count: 2 });
    expect(text).toBe(
      `milled 2 cards: ${top.map((id) => nameOf(state, id)).join(', ')}`
    );
  });

  it('never names a card found by a search into the hand or library', () => {
    const state = opening();
    const [a, b] = ids(state, 'library').slice(4);
    const toHand = step(state, {
      type: 'searchLibrary',
      playerId: P1,
      instanceIds: [a, b],
      to: 'hand',
      shuffle: true,
    });
    expect(toHand.text).toBe(
      'searched their library and put 2 cards into their hand, then shuffled'
    );
    const toTop = step(state, {
      type: 'searchLibrary',
      playerId: P1,
      instanceIds: [a],
      to: 'library',
      shuffle: true,
    });
    expect(toTop.text).toBe(
      'searched their library, then shuffled, and put a card on top of ' +
        'their library'
    );
  });

  it('names a card searched onto the battlefield', () => {
    const state = opening();
    const [found] = ids(state, 'library').slice(3);
    const { text } = step(state, {
      type: 'searchLibrary',
      playerId: P1,
      instanceIds: [found],
      to: 'battlefield',
      shuffle: true,
    });
    expect(text).toBe(
      `searched their library and put ${nameOf(state, found)} onto the ` +
        'battlefield, then shuffled'
    );
  });

  it('looking at the top names only what goes to the graveyard', () => {
    const state = opening();
    const [a, b, c, d] = ids(state, 'library');
    const { text } = step(state, {
      type: 'arrangeTop',
      playerId: P1,
      top: [b],
      bottom: [a],
      graveyard: [c],
      hand: [d],
    });
    expect(text).toBe(
      'looked at the top 4 cards of their library: 1 on top, 1 on the ' +
        `bottom, ${nameOf(state, c)} into their graveyard, a card into ` +
        'their hand'
    );
    const scry = step(state, {
      type: 'arrangeTop',
      playerId: P1,
      top: [b, a],
      bottom: [],
      graveyard: [],
      hand: [],
    });
    expect(scry.text).toBe(
      'looked at the top 2 cards of their library: 2 on top'
    );
  });

  it('names a discarded card but not moves between hidden zones', () => {
    const state = opening();
    const [discard, tuck] = ids(state, 'hand');
    const discarded = step(state, {
      type: 'moveCard',
      instanceId: discard,
      to: 'graveyard',
    });
    expect(discarded.text).toBe(`discarded ${nameOf(state, discard)}`);

    const tucked = step(state, {
      type: 'moveCard',
      instanceId: tuck,
      to: 'library',
      index: 0,
    });
    expect(tucked.text).toBe(
      'put a card from their hand on top of their library'
    );
    const tutored = step(state, {
      type: 'moveCard',
      instanceId: ids(state, 'library')[5],
      to: 'hand',
    });
    expect(tutored.text).toBe('put a card from their library into their hand');
  });

  it('names a card played from the hand, which is now public', () => {
    const state = opening();
    const [played] = ids(state, 'hand');
    const { text } = step(state, {
      type: 'moveCard',
      instanceId: played,
      to: 'battlefield',
    });
    expect(text).toBe(`played ${nameOf(state, played)}`);
  });

  it('never names a face-down card until it is turned face up', () => {
    const state = opening();
    const [morph] = ids(state, 'hand');
    const secret = nameOf(state, morph);
    const played = step(state, {
      type: 'moveCard',
      instanceId: morph,
      to: 'battlefield',
      faceDown: true,
    });
    expect(played.text).toBe('played a card face down');

    const tapped = step(played.next, { type: 'tap', instanceId: morph });
    expect(tapped.text).toBe('tapped a face-down card');
    const countered = step(tapped.next, {
      type: 'adjustCounter',
      instanceId: morph,
      counter: '+1/+1',
      delta: 1,
    });
    expect(countered.text).toBe(
      'a face-down card: got 1 +1/+1 counter (now 1)'
    );

    // Back to the hand it stays a secret.
    const bounced = step(countered.next, {
      type: 'moveCard',
      instanceId: morph,
      to: 'hand',
    });
    expect(bounced.text).toBe(
      'put a face-down card into their hand from the battlefield'
    );

    // Turned up, it's public and named.
    const flipped = reduce(countered.next, {
      type: 'setFaceDown',
      instanceId: morph,
      faceDown: false,
    });
    expect(
      describeStep(
        countered.next,
        { type: 'setFaceDown', instanceId: morph, faceDown: false },
        flipped,
        P1
      )
    ).toBe(`turned a face-down card face up: ${secret}`);
  });

  it('manifesting from the library names nothing', () => {
    const state = opening();
    const { text } = step(state, {
      type: 'moveCard',
      instanceId: ids(state, 'library')[0],
      to: 'battlefield',
      faceDown: true,
    });
    expect(text).toBe(
      'put a card from their library onto the battlefield face down'
    );
  });

  it('mulligans and keeps by count only', () => {
    const state = opening();
    const mull = step(state, { type: 'mulligan', playerId: P1 });
    expect(mull.text).toBe('took a mulligan (1 so far)');
    const kept = step(mull.next, {
      type: 'keepHand',
      playerId: P1,
      bottom: [ids(mull.next, 'hand')[0]],
    });
    expect(kept.text).toBe('kept their hand, putting a card on the bottom');
  });

  it('names revealed cards, which everyone can see', () => {
    const state = opening();
    const [shown] = ids(state, 'hand');
    const { text } = step(state, {
      type: 'reveal',
      playerId: P1,
      source: 'card',
      instanceId: shown,
    });
    expect(text).toBe(`revealed ${nameOf(state, shown)} from their hand`);
  });

  it('shuffling a hand card into the library names nothing', () => {
    const state = opening();
    const { text } = step(state, {
      type: 'shuffleIntoLibrary',
      instanceId: ids(state, 'hand')[0],
    });
    expect(text).toBe('shuffled a card from their hand into their library');
  });
});

describe('describeAction wording', () => {
  const onField = () => {
    const state = opening();
    const [a, b] = ids(state, 'hand');
    return {
      a,
      b,
      state: applyAll(state, [
        { type: 'moveCard', instanceId: a, to: 'battlefield' },
        { type: 'moveCard', instanceId: b, to: 'battlefield' },
      ]),
    };
  };

  it('describes life, tapping, tokens, and attachments', () => {
    const { a, b, state } = onField();
    const text = (action: GameAction) =>
      describeStep(state, action, reduce(state, action), P1);
    expect(text({ type: 'adjustLife', playerId: P1, delta: -3 })).toBe(
      'lost 3 life (20 → 17)'
    );
    expect(text({ type: 'setLife', playerId: P1, life: 25 })).toBe(
      'gained 5 life (20 → 25)'
    );
    expect(text({ type: 'toggleTap', instanceId: a })).toBe(
      `tapped ${nameOf(state, a)}`
    );
    expect(
      text({
        type: 'createTokens',
        playerId: P1,
        ref: { ...cardRef('Goblin'), id: '' },
        count: 2,
      })
    ).toBe('created 2 Goblin tokens');
    expect(text({ type: 'attach', instanceId: a, to: b })).toBe(
      `attached ${nameOf(state, a)} to ${nameOf(state, b)}`
    );
    expect(
      text({ type: 'setPosition', instanceId: a, position: { x: 1, y: 1 } })
    ).toBeNull();
    expect(
      text({ type: 'moveCard', instanceId: a, to: 'library', index: 0 })
    ).toBe(
      `put ${nameOf(state, a)} on top of their library from the battlefield`
    );
  });

  it('describes new games and draws against public views directly', () => {
    const state = opening();
    const before = publicView(state, P1);
    const next = reduce(state, { type: 'draw', playerId: P1, count: 3 });
    const after = publicView(next, P1);
    if (!before || !after) throw new Error('no view');
    expect(
      describeAction(before, { type: 'draw', playerId: P1, count: 3 }, after)
    ).toBe('drew 3 cards');
  });
});

describe('describeAction privacy under random play', () => {
  const zones: ZoneId[] = [
    'library',
    'hand',
    'battlefield',
    'graveyard',
    'exile',
  ];

  // A small LCG keeps the run reproducible.
  const random = (seed: number) => {
    let s = seed;
    return (max: number) => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return Math.floor((s / 2 ** 31) * max);
    };
  };

  it('no step of a long random game names a hidden card', () => {
    const pick = random(7);
    let state = opening();
    let described = 0;
    for (let i = 0; i < 600; i += 1) {
      const all = Object.keys(state.cards);
      const card = all[pick(all.length)];
      const library = ids(state, 'library');
      const hand = ids(state, 'hand');
      const top = library.slice(0, Math.min(3, library.length));
      const choices: GameAction[] = [
        { type: 'draw', playerId: P1, count: 1 + pick(2) },
        { type: 'mill', playerId: P1, count: 1 + pick(2) },
        {
          type: 'moveCard',
          instanceId: card,
          to: zones[pick(zones.length)],
          faceDown: pick(3) === 0,
          index: pick(2) === 0 ? 0 : undefined,
        },
        { type: 'toggleTap', instanceId: card },
        { type: 'setFaceDown', instanceId: card, faceDown: pick(2) === 0 },
        { type: 'shuffleIntoLibrary', instanceId: card },
        {
          type: 'arrangeTop',
          playerId: P1,
          top: top.slice(0, 1),
          bottom: top.slice(1, 2),
          graveyard: [],
          hand: top.slice(2),
        },
        {
          type: 'searchLibrary',
          playerId: P1,
          instanceIds: library.slice(pick(4), 1 + pick(4)),
          to: (['hand', 'library', 'battlefield', 'exile'] as const)[pick(4)],
          shuffle: pick(2) === 0,
        },
        { type: 'reveal', playerId: P1, source: 'hand' },
        { type: 'hideReveal', playerId: P1 },
        {
          type: 'reveal',
          playerId: P1,
          source: 'card',
          instanceId: hand[pick(Math.max(1, hand.length))] ?? card,
        },
        { type: 'adjustCounter', instanceId: card, counter: 'x', delta: 1 },
      ];
      const action = choices[pick(choices.length)];
      if (reduce(state, action) === state) continue;
      const { next, text } = step(state, action, false);
      if (text) described += 1;
      state = next;
    }
    expect(described).toBeGreaterThan(200);
  });
});
