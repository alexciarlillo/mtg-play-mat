import { describe, expect, it } from 'vitest';

import { reduce } from './reducer';
import { applyAll, cardRef, startGame, zone } from './testFixtures';
import type { CardRef, GameState } from './types';
import { privateView, publicView } from './views';

const P1 = 'p1';

// Distinct, searchable names and ids so a leak shows up in the JSON.
const secretDeck: CardRef[] = Array.from({ length: 12 }, (_, i) => {
  const n = String(i).padStart(2, '0');
  return cardRef(`Secret Card ${n}`, `secret-scryfall-${n}`);
});

// Leaves two cards in hand, seven in the library, and one each on the
// battlefield (tapped), in the graveyard, in exile, and in the command zone.
const midGame = (): GameState => {
  let state = startGame(
    [
      {
        id: P1,
        name: 'Alice',
        deck: secretDeck,
        command: [cardRef('Public Commander', 'commander-id')],
      },
    ],
    5
  );
  state = applyAll(state, [
    { type: 'shuffle', playerId: P1 },
    { type: 'draw', playerId: P1, count: 5 },
  ]);
  const [toField, toYard, toExile] = zone(state, P1, 'hand');
  return applyAll(state, [
    { type: 'moveCard', instanceId: toField, to: 'battlefield' },
    { type: 'toggleTap', instanceId: toField },
    { type: 'moveCard', instanceId: toYard, to: 'graveyard' },
    { type: 'moveCard', instanceId: toExile, to: 'exile' },
  ]);
};

const hiddenCards = (state: GameState) =>
  [...zone(state, P1, 'hand'), ...zone(state, P1, 'library')].map(
    (id) => state.cards[id]
  );

describe('publicView', () => {
  it('shows public zones, life, and hidden-zone counts', () => {
    const state = midGame();
    const view = publicView(state, P1);

    expect(view).toMatchObject({
      seq: state.seq,
      playerId: P1,
      name: 'Alice',
      life: 20,
      handCount: 2,
      libraryCount: 7,
    });
    expect(view?.zones.battlefield).toHaveLength(1);
    expect(view?.zones.battlefield[0]).toMatchObject({
      tapped: true,
      zone: 'battlefield',
      position: { x: 0, y: 0 },
    });
    expect(view?.zones.graveyard).toHaveLength(1);
    expect(view?.zones.exile).toHaveLength(1);
    expect(view?.zones.command[0].ref?.name).toBe('Public Commander');
    expect(Object.keys(view ?? {}).sort()).toEqual(
      [
        'commanderDamage',
        'counters',
        'dummies',
        'handCount',
        'keptHand',
        'libraryCount',
        'life',
        'mulligans',
        'name',
        'playerId',
        'seq',
        'zones',
      ].sort()
    );
  });

  it('never contains hand or library card identities', () => {
    const state = midGame();
    const hidden = hiddenCards(state);
    expect(hidden).toHaveLength(9);

    const json = JSON.stringify(publicView(state, P1));

    hidden.forEach((card) => {
      expect(json).not.toContain(card.ref.name);
      expect(json).not.toContain(card.ref.id);
      expect(json).not.toContain(`"${card.instanceId}"`);
    });
    // Neither the PRNG state (which predicts shuffles) nor the log leaks.
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"log"');
    expect(json).not.toContain('newGame');

    // Sanity check: the public cards are there, so the test can fail.
    const shown = zone(state, P1, 'battlefield').map((id) => state.cards[id]);
    expect(json).toContain(shown[0].ref.name);
  });

  it('shows mulligans without leaking the new or bottomed cards', () => {
    let state = applyAll(startGame([{ id: P1, name: 'A', deck: secretDeck }]), [
      { type: 'shuffle', playerId: P1 },
      { type: 'draw', playerId: P1, count: 7 },
      { type: 'mulligan', playerId: P1 },
    ]);
    const [bottomed] = zone(state, P1, 'hand');
    state = reduce(state, {
      type: 'keepHand',
      playerId: P1,
      bottom: [bottomed],
    });

    const view = publicView(state, P1);
    expect(view).toMatchObject({ mulligans: 1, keptHand: true, handCount: 6 });
    const json = JSON.stringify(view);
    hiddenCards(state).forEach((card) => {
      expect(json).not.toContain(card.ref.name);
      expect(json).not.toContain(card.ref.id);
      expect(json).not.toContain(`"${card.instanceId}"`);
    });
    expect(json).not.toContain('keepHand');
  });

  it('hides face-down permanents from everyone but their owner', () => {
    const state = midGame();
    const [id] = zone(state, P1, 'battlefield');
    const faceDown: GameState = {
      ...state,
      cards: {
        ...state.cards,
        [id]: { ...state.cards[id], faceDown: true, faceIndex: 1 },
      },
    };
    const { name, id: scryfallId } = state.cards[id].ref;

    const publicJson = JSON.stringify(publicView(faceDown, P1));
    expect(publicJson).not.toContain(name);
    expect(publicJson).not.toContain(scryfallId);
    expect(publicView(faceDown, P1)?.zones.battlefield[0]).toMatchObject({
      ref: null,
      faceDown: true,
      faceIndex: 0,
    });

    expect(privateView(faceDown, P1)?.zones.battlefield[0].ref?.name).toBe(
      name
    );
  });

  it('is plain JSON', () => {
    const view = publicView(midGame(), P1);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    expect(structuredClone(view)).toEqual(view);
  });

  it('is detached from the state', () => {
    const state = midGame();
    const position = publicView(state, P1)?.zones.battlefield[0].position;
    if (position) position.x = 999;
    const [id] = zone(state, P1, 'battlefield');
    expect(state.cards[id].position?.x).toBe(0);
  });

  it('is null for an unknown player', () => {
    expect(publicView(midGame(), 'nobody')).toBeNull();
    expect(privateView(midGame(), 'nobody')).toBeNull();
  });

  it('only describes the requested player', () => {
    const state = reduce(
      startGame([
        { id: 'p1', name: 'p1', deck: [cardRef('Mine')] },
        { id: 'p2', name: 'p2', deck: [cardRef('Theirs')] },
      ]),
      { type: 'draw', playerId: 'p2', count: 1 }
    );
    expect(publicView(state, 'p1')).toMatchObject({
      handCount: 0,
      libraryCount: 1,
    });
    expect(JSON.stringify(privateView(state, 'p1'))).not.toContain('Theirs');
  });
});

describe('privateView', () => {
  it('adds the hand, in order, to the public view', () => {
    const state = midGame();
    const view = privateView(state, P1);

    expect(view?.hand.map((card) => card.instanceId)).toEqual(
      zone(state, P1, 'hand')
    );
    expect(view?.hand[0].ref).toEqual(
      state.cards[zone(state, P1, 'hand')[0]].ref
    );
    expect(view).toMatchObject({ handCount: 2, libraryCount: 7 });
  });

  it('never contains library card identities', () => {
    const state = midGame();
    const json = JSON.stringify(privateView(state, P1));
    zone(state, P1, 'library').forEach((id) => {
      expect(json).not.toContain(state.cards[id].ref.name);
      expect(json).not.toContain(`"${id}"`);
    });
  });
});
