import { describe, expect, it } from 'vitest';

import { undoLast } from './history';
import {
  knownCards,
  type KnownLedger,
  learnFromChange,
  learnTop,
  NO_KNOWLEDGE,
  truthful,
} from './knownCards';
import { reduce } from './reducer';
import { cardRef, deepFreeze, player, startGame, zone } from './testFixtures';
import type { GameAction, GameState } from './types';

const P1 = 'p1';

const lib = (state: GameState) => zone(state, P1, 'library');
const hand = (state: GameState) => zone(state, P1, 'hand');

type Step = GameAction | ((state: GameState) => GameAction) | 'undo';

interface Played {
  state: GameState;
  ledger: KnownLedger;
}

// Each step goes through learnFromChange, as main applies every change.
const play = (steps: Step[], start?: GameState): Played => {
  let state = start ?? deepFreeze(startGame([player(P1, 10)]));
  let ledger = NO_KNOWLEDGE;
  steps.forEach((step) => {
    let next: GameState;
    if (step === 'undo') {
      const undone = undoLast(state, P1, 1);
      if (!undone) throw new Error('nothing to undo');
      next = undone.state;
    } else {
      next = reduce(state, typeof step === 'function' ? step(state) : step);
      if (next === state) throw new Error('the step changed nothing');
    }
    ledger = learnFromChange(ledger, state, next, P1);
    state = next;
    expectTruthful({ state, ledger });
  });
  return { state, ledger };
};

// Whatever the ledger claims must be so: an exact slot holds that card,
// and a random slot holds one of its candidates.
const expectTruthful = ({ state, ledger }: Played) => {
  const library = lib(state);
  if (ledger.slots.length !== library.length) return;
  ledger.slots.forEach((slot, i) => {
    if (slot) expect(slot).toContain(library[i]);
  });
};

// Card names as the strip lists them; ~ marks a random-order block.
const shown = ({ state, ledger }: Played) => {
  const { top, bottom } = knownCards(state, P1, ledger);
  const label = (card: { ref: { name: string }; random?: true }) =>
    card.random ? `~${card.ref.name}` : card.ref.name;
  return { top: top.map(label), bottom: bottom.map(label) };
};

const arrange = (
  pick: (library: string[]) => Partial<Record<'top' | 'bottom', string[]>>,
  extra: { bottomRandom?: boolean; shuffleAfter?: boolean; count?: number } = {}
) => {
  return (state: GameState): GameAction => {
    const library = lib(state).slice(0, extra.count ?? 2);
    const { top = [], bottom = [] } = pick(library);
    return {
      type: 'arrangeTop',
      playerId: P1,
      top,
      bottom,
      graveyard: library.filter(
        (id) => !top.includes(id) && !bottom.includes(id)
      ),
      exile: [],
      hand: [],
      ...(extra.bottomRandom && { bottomRandom: true }),
      ...(extra.shuffleAfter && { shuffleAfter: true }),
    };
  };
};

// Scry 2: the first card to the bottom, the second kept on top.
const scry2 = arrange(([a, b]) => ({ top: [b], bottom: [a] }));
const draw = (count = 1): GameAction => ({ type: 'draw', playerId: P1, count });
const shuffle: GameAction = { type: 'shuffle', playerId: P1 };

const NOTHING = { top: [], bottom: [] };

describe('known cards: what fills the strip', () => {
  it.each<[string, Step[], { top: string[]; bottom: string[] }]>([
    ['nothing after a plain draw', [draw()], NOTHING],
    ['scry 2', [scry2], { top: ['p1 1'], bottom: ['p1 0'] }],
    [
      'a look that reorders the top',
      [arrange(([a, b]) => ({ top: [b, a] }))],
      { top: ['p1 1', 'p1 0'], bottom: [] },
    ],
    [
      'a surveil keeps only what stays in the library',
      [arrange(([, b]) => ({ top: [b] }))],
      { top: ['p1 1'], bottom: [] },
    ],
    [
      'a random bottom is known by name only',
      [
        arrange((ids) => ({ bottom: ids }), {
          bottomRandom: true,
          count: 3,
        }),
      ],
      { top: [], bottom: ['~p1 0', '~p1 1', '~p1 2'] },
    ],
    [
      'Ponder shuffling instead forgets the look',
      [arrange((ids) => ({ top: ids }), { shuffleAfter: true })],
      NOTHING,
    ],
    [
      'Brainstorm: draw 3, put 2 back in order',
      [
        draw(3),
        (s) => ({
          type: 'putFromHand',
          playerId: P1,
          top: [hand(s)[2], hand(s)[0]],
          bottom: [],
        }),
      ],
      { top: ['p1 2', 'p1 0'], bottom: [] },
    ],
    [
      'put back on the bottom',
      [
        draw(2),
        (s) => ({
          type: 'putFromHand',
          playerId: P1,
          top: [],
          bottom: [hand(s)[1], hand(s)[0]],
        }),
      ],
      { top: [], bottom: ['p1 1', 'p1 0'] },
    ],
    [
      'a search to the top after its shuffle',
      [
        scry2,
        (s) => ({
          type: 'searchLibrary',
          playerId: P1,
          picks: [{ instanceId: lib(s)[5], to: 'top' }],
          shuffle: true,
        }),
      ],
      { top: ['p1 6'], bottom: [] },
    ],
    [
      'a search to the bottom without a shuffle',
      [
        scry2,
        (s) => ({
          type: 'searchLibrary',
          playerId: P1,
          picks: [{ instanceId: lib(s)[4], to: 'bottom' }],
          shuffle: false,
        }),
      ],
      { top: ['p1 1'], bottom: ['p1 0', 'p1 5'] },
    ],
    [
      'a hand card put on top',
      [
        draw(),
        (s) => ({
          type: 'moveCard',
          instanceId: hand(s)[0],
          to: 'library',
          index: 0,
        }),
      ],
      { top: ['p1 0'], bottom: [] },
    ],
    [
      'a card put 2nd from the top is known once the top is drawn',
      [
        draw(),
        (s) => ({
          type: 'moveCard',
          instanceId: hand(s)[0],
          to: 'library',
          index: 1,
        }),
        draw(),
      ],
      { top: ['p1 0'], bottom: [] },
    ],
    [
      'cards moved together onto the library',
      [
        draw(2),
        (s) => ({
          type: 'moveCards',
          playerId: P1,
          instanceIds: hand(s),
          to: 'library',
          index: 0,
        }),
      ],
      { top: ['p1 0', 'p1 1'], bottom: [] },
    ],
    [
      'a reveal from the top',
      [{ type: 'reveal', playerId: P1, source: 'libraryTop', count: 2 }],
      { top: ['p1 0', 'p1 1'], bottom: [] },
    ],
    [
      'the top card played revealed, through a draw',
      [{ type: 'setTopRevealed', playerId: P1, revealed: true }, draw()],
      { top: ['p1 1'], bottom: [] },
    ],
  ])('%s', (_, steps, expected) => {
    expect(shown(play(steps))).toEqual(expected);
  });

  it('the mulligan bottom of a kept hand', () => {
    let bottomed = '';
    const played = play([
      draw(7),
      { type: 'mulligan', playerId: P1 },
      (s) => {
        bottomed = s.cards[hand(s)[3]].ref.name;
        return { type: 'keepHand', playerId: P1, bottom: [hand(s)[3]] };
      },
    ]);
    expect(shown(played)).toEqual({ top: [], bottom: [bottomed] });
  });
});

describe('known cards: what wipes or shifts the strip', () => {
  it.each<[string, Step[], { top: string[]; bottom: string[] }]>([
    ['a shuffle', [scry2, shuffle], NOTHING],
    [
      'a mulligan',
      [scry2, draw(7), { type: 'mulligan', playerId: P1 }],
      NOTHING,
    ],
    [
      'a card shuffled into the library',
      [
        scry2,
        draw(),
        (s) => ({ type: 'shuffleIntoLibrary', instanceId: hand(s)[0] }),
      ],
      NOTHING,
    ],
    [
      'a search that shuffles',
      [
        scry2,
        (s) => ({
          type: 'searchLibrary',
          playerId: P1,
          picks: [{ instanceId: lib(s)[3], to: 'hand' }],
          shuffle: true,
        }),
      ],
      NOTHING,
    ],
    ['a draw takes the top', [scry2, draw()], { top: [], bottom: ['p1 0'] }],
    [
      'a draw shifts the next known card up',
      [arrange(([a, b]) => ({ top: [b, a] })), draw()],
      { top: ['p1 0'], bottom: [] },
    ],
    [
      'a mill takes the top',
      [
        arrange(([a, b]) => ({ top: [b, a] })),
        { type: 'mill', playerId: P1, count: 1 },
      ],
      { top: ['p1 0'], bottom: [] },
    ],
    [
      'drawing into an unknown card ends the top run',
      [scry2, draw(2)],
      { top: [], bottom: ['p1 0'] },
    ],
  ])('%s', (_, steps, expected) => {
    expect(shown(play(steps))).toEqual(expected);
  });
});

describe('known cards: undo', () => {
  it.each<[string, Step[], { top: string[]; bottom: string[] }]>([
    [
      'an undone draw is back on top',
      [draw(), 'undo'],
      {
        top: ['p1 0'],
        bottom: [],
      },
    ],
    [
      'an undone draw of a known card keeps the rest',
      [arrange(([a, b]) => ({ top: [b, a] })), draw(), 'undo'],
      { top: ['p1 1', 'p1 0'], bottom: [] },
    ],
    [
      'an undone shuffle brings back what was known before it',
      [scry2, shuffle, 'undo'],
      { top: ['p1 1'], bottom: ['p1 0'] },
    ],
    [
      'an undone scry still remembers the cards seen',
      [scry2, 'undo'],
      { top: ['p1 0', 'p1 1'], bottom: [] },
    ],
    [
      'an undone mill puts the seen cards back on top',
      [{ type: 'mill', playerId: P1, count: 2 }, 'undo'],
      { top: ['p1 0', 'p1 1'], bottom: [] },
    ],
    [
      'an undone put-back forgets the cards, which are in hand again',
      [
        draw(2),
        (s) => ({
          type: 'putFromHand',
          playerId: P1,
          top: hand(s),
          bottom: [],
        }),
        'undo',
      ],
      NOTHING,
    ],
  ])('%s', (_, steps, expected) => {
    expect(shown(play(steps))).toEqual(expected);
  });

  it('a redo after an undo learns from the action again', () => {
    const scried = play([scry2]);
    const undone = undoLast(scried.state, P1, 1);
    if (!undone) throw new Error('nothing to undo');
    const action = undone.action;
    const back = learnFromChange(scried.ledger, scried.state, undone.state, P1);
    const redone = reduce(undone.state, action);
    const ledger = learnFromChange(back, undone.state, redone, P1);
    expect(shown({ state: redone, ledger })).toEqual({
      top: ['p1 1'],
      bottom: ['p1 0'],
    });
  });
});

describe('known cards: looks that change nothing', () => {
  it('learns cards that are exactly the top of the library', () => {
    const { state } = play([draw()]);
    const top = lib(state).slice(0, 2);
    const ledger = learnTop(NO_KNOWLEDGE, state, P1, top);
    expect(shown({ state, ledger }).top).toEqual(['p1 1', 'p1 2']);
  });

  it('ignores cards that are not the top', () => {
    const { state } = play([draw()]);
    const ids = [lib(state)[1]];
    expect(learnTop(NO_KNOWLEDGE, state, P1, ids)).toBe(NO_KNOWLEDGE);
  });
});

describe('known cards: presenting them', () => {
  it('puts a library known all the way down in top', () => {
    const start = deepFreeze(startGame([player(P1, 2)]));
    const { state, ledger } = play(
      [arrange(([a, b]) => ({ top: [b], bottom: [a] }))],
      start
    );
    expect(shown({ state, ledger })).toEqual({
      top: ['p1 1', 'p1 0'],
      bottom: [],
    });
  });

  it('never shows the real order of a random block', () => {
    const start = deepFreeze(
      startGame([
        {
          id: P1,
          name: P1,
          deck: ['Zebra', 'Apple', 'Mango', 'Kiwi'].map((n) => cardRef(n)),
        },
      ])
    );
    const played = play(
      [arrange((ids) => ({ bottom: ids }), { bottomRandom: true, count: 3 })],
      start
    );
    expect(shown(played).bottom).toEqual(['~Apple', '~Mango', '~Zebra']);
  });

  it('a card put on the bottom after a random block stays exact', () => {
    const played = play([
      arrange((ids) => ({ bottom: ids }), { bottomRandom: true, count: 2 }),
      draw(),
      (s) => ({
        type: 'moveCard',
        instanceId: hand(s)[0],
        to: 'library',
      }),
    ]);
    expect(shown(played).bottom).toEqual(['~p1 0', '~p1 1', 'p1 2']);
  });
});

// Cases where reading the rebuilt or changed library would claim a
// position the player never saw.
describe('known cards: never a position the player never saw', () => {
  const nothingKnown = (played: Played) =>
    expect(shown(played)).toEqual(NOTHING);

  it('an undone mulligan knows only what was known before it', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const start = deepFreeze(startGame([player(P1, 30)], seed));
      nothingKnown(
        play(
          [shuffle, draw(7), { type: 'mulligan', playerId: P1 }, 'undo'],
          start
        )
      );
    }
  });

  it('a look after a shuffle is forgotten when the shuffle is undone', () => {
    let state = deepFreeze(startGame([player(P1, 10)]));
    let ledger = learnFromChange(
      NO_KNOWLEDGE,
      state,
      reduce(state, shuffle),
      P1
    );
    state = reduce(state, shuffle);
    ledger = learnTop(ledger, state, P1, lib(state));
    expect(shown({ state, ledger }).top).toHaveLength(10);
    const undone = undoLast(state, P1, 1);
    if (!undone) throw new Error('nothing to undo');
    ledger = learnFromChange(ledger, state, undone.state, P1);
    nothingKnown({ state: undone.state, ledger });
  });

  it('an undone search to hand never places the tutored card', () => {
    const start = deepFreeze(startGame([player(P1, 10)]));
    const ledger = learnTop(NO_KNOWLEDGE, start, P1, [lib(start)[0]]);
    const tutored = lib(start)[1];
    const searched = reduce(start, {
      type: 'searchLibrary',
      playerId: P1,
      picks: [{ instanceId: tutored, to: 'hand' }],
      shuffle: false,
    });
    const after = learnFromChange(ledger, start, searched, P1);
    const undone = undoLast(searched, P1, 1);
    if (!undone) throw new Error('nothing to undo');
    const back = learnFromChange(after, searched, undone.state, P1);
    expect(shown({ state: undone.state, ledger: back })).toEqual({
      top: ['p1 0'],
      bottom: [],
    });
  });

  it('an undone search with a shuffle forgets the card it put on top', () => {
    nothingKnown(
      play([
        (s) => ({
          type: 'searchLibrary',
          playerId: P1,
          picks: [{ instanceId: lib(s).at(-1)!, to: 'top' }],
          shuffle: true,
        }),
        'undo',
      ])
    );
  });

  it('an undone search keeps a random block random', () => {
    const played = play([
      arrange((ids) => ({ bottom: ids }), { bottomRandom: true, count: 3 }),
      (s) => ({
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: lib(s).at(-1)!, to: 'hand' }],
        shuffle: false,
      }),
      'undo',
    ]);
    expect(shown(played).bottom).toEqual(['~p1 0', '~p1 1', '~p1 2']);
  });

  it('a search from the block leaves the rest of it random', () => {
    const played = play([
      arrange((ids) => ({ bottom: ids }), { bottomRandom: true, count: 3 }),
      (s) => ({
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: lib(s).at(-1)!, to: 'hand' }],
        shuffle: false,
      }),
    ]);
    expect(shown(played).bottom).toHaveLength(2);
    expect(shown(played).bottom.every((n) => n.startsWith('~'))).toBe(true);
  });

  it('a known card put inside a random block never shows its order', () => {
    const start = deepFreeze(
      startGame([
        {
          id: P1,
          name: P1,
          deck: ['Zebra', 'Apple', 'Mango', 'Kiwi', 'Fig'].map((n) =>
            cardRef(n)
          ),
        },
      ])
    );
    // Many seeds, so the random order lands every way round.
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const played = play(
        [
          arrange((ids) => ({ bottom: ids }), {
            bottomRandom: true,
            count: 3,
          }),
          draw(),
          (s) => ({
            type: 'moveCard',
            instanceId: hand(s)[0],
            to: 'library',
            index: lib(s).length - 1,
          }),
        ],
        deepFreeze({ ...start, rng: seed })
      );
      seen.add(shown(played).bottom.join(','));
    }
    // The strip reads the same whatever the real order was.
    expect([...seen]).toEqual(['~Apple,~Mango,Kiwi,~Zebra']);
  });

  it('a middle card is not the top once an unknown card is tutored', () => {
    const played = play([
      draw(),
      (s) => ({
        type: 'moveCard',
        instanceId: hand(s)[0],
        to: 'library',
        index: 1,
      }),
      (s) => ({
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: lib(s)[0], to: 'hand' }],
        shuffle: false,
      }),
    ]);
    nothingKnown(played);
  });

  it('a known top card stays the top through a search below it', () => {
    const played = play([
      arrange(([a, b]) => ({ top: [b, a] })),
      (s) => ({
        type: 'searchLibrary',
        playerId: P1,
        picks: [{ instanceId: lib(s)[5], to: 'hand' }],
        shuffle: false,
      }),
    ]);
    expect(shown(played).top).toEqual(['p1 1', 'p1 0']);
  });
});

describe('known cards: a ledger that is wrong is never shown', () => {
  // A scry, then the two known slots swapped by hand, as a badly
  // modelled action might leave them.
  const corrupted = () => {
    const played = play([scry2]);
    const slots = [...played.ledger.slots];
    const last = slots.length - 1;
    [slots[0], slots[last]] = [slots[last], slots[0]];
    return { ...played, ledger: { ...played.ledger, slots } };
  };

  it('shows an empty strip rather than a wrong position', () => {
    const played = corrupted();
    expect(truthful(played.ledger, played.state, P1)).toBe(false);
    expect(shown(played)).toEqual(NOTHING);
  });

  it('drops the knowledge at the next change', () => {
    const { state, ledger } = corrupted();
    const next = reduce(state, { type: 'adjustLife', playerId: P1, delta: -1 });
    const learned = learnFromChange(ledger, state, next, P1);
    expect(learned).toBe(NO_KNOWLEDGE);
    expect(shown({ state: next, ledger: learned })).toEqual(NOTHING);
  });

  it('keeps a ledger that is right', () => {
    const played = play([scry2]);
    expect(truthful(played.ledger, played.state, P1)).toBe(true);
  });
});
