import { describe, expect, it } from 'vitest';

import { describeSeen, MAX_SEEN, type SeenEntry, SeenList } from './seen';
import { cardRef, player, startGame } from './testFixtures';
import type { CardRef } from './types';
import { type PublicView, publicView, type RevealView } from './views';

const base = (): PublicView => {
  const view = publicView(startGame([player('alice')]), 'alice');
  if (!view) throw new Error('no view');
  return view;
};

const view = (extra: Partial<PublicView>): PublicView => ({
  ...base(),
  ...extra,
});

const refs = (...names: string[]) => names.map((name) => cardRef(name));

const revealed = (
  source: RevealView['source'],
  names: string[],
  flags: Partial<RevealView> = {}
) => view({ revealed: { source, cards: refs(...names), ...flags } });

const alice = (v: PublicView | null) => ({
  playerId: 'alice',
  name: 'Alice',
  view: v,
});

const summary = (entries: SeenEntry[]) =>
  entries.map((e) => [e.playerName, e.source, e.cards.map((c) => c.name)]);

const list = () => {
  let t = 0;
  return new SeenList(() => ++t);
};

describe('the seen list of public reveals', () => {
  it('records a reveal once, however many views it lasts', () => {
    const seen = list();
    expect(seen.notePeers([alice(revealed('hand', ['A', 'B']))])).toBe(true);
    expect(seen.notePeers([alice(revealed('hand', ['A', 'B']))])).toBe(false);
    expect(summary(seen.everyone)).toEqual([['Alice', 'hand', ['A', 'B']]]);
  });

  it('keeps the reveal after it ends', () => {
    const seen = list();
    seen.notePeers([alice(revealed('libraryTop', ['A']))]);
    expect(seen.notePeers([alice(view({ revealed: null }))])).toBe(false);
    expect(summary(seen.everyone)).toEqual([['Alice', 'libraryTop', ['A']]]);
  });

  it('a reveal that grows updates its entry in place', () => {
    const seen = list();
    seen.notePeers([alice(revealed('libraryTop', ['A']))]);
    const [first] = seen.everyone;
    expect(seen.notePeers([alice(revealed('libraryTop', ['A', 'B']))])).toBe(
      true
    );
    expect(seen.everyone).toHaveLength(1);
    expect(seen.everyone[0]).toMatchObject({ id: first.id, at: first.at });
    expect(summary(seen.everyone)).toEqual([
      ['Alice', 'libraryTop', ['A', 'B']],
    ]);
  });

  it('a reveal that shrinks as its cards are played keeps its entry', () => {
    const seen = list();
    seen.notePeers([alice(revealed('hand', ['A', 'B', 'C']))]);
    expect(seen.notePeers([alice(revealed('hand', ['A', 'C']))])).toBe(false);
    expect(summary(seen.everyone)).toEqual([
      ['Alice', 'hand', ['A', 'B', 'C']],
    ]);
  });

  it.each<[string, PublicView, PublicView, number]>([
    [
      'the same cards after the reveal ended',
      revealed('hand', ['A']),
      view({ revealed: null }),
      2,
    ],
    [
      'another source',
      revealed('libraryTop', ['A']),
      revealed('hand', ['A']),
      2,
    ],
    ['other cards', revealed('hand', ['A']), revealed('hand', ['B']), 3],
  ])('a new reveal after %s is a new entry', (_, first, between, count) => {
    const seen = list();
    seen.notePeers([alice(first)]);
    seen.notePeers([alice(between)]);
    seen.notePeers([alice(revealed('hand', ['A']))]);
    expect(seen.everyone).toHaveLength(count);
  });

  it('names search and face-down reveals as such', () => {
    const seen = list();
    seen.notePeers([alice(revealed('card', ['A'], { search: true }))]);
    seen.notePeers([alice(revealed('card', ['B'], { faceDown: true }))]);
    expect(seen.everyone.map((e) => e.source)).toEqual(['search', 'faceDown']);
  });

  it('records each new top card played revealed', () => {
    const seen = list();
    const top = (ref: CardRef | null) => alice(view({ topCard: ref }));
    seen.notePeers([top(cardRef('A'))]);
    seen.notePeers([top(cardRef('A'))]);
    seen.notePeers([top(cardRef('B'))]);
    seen.notePeers([top(null)]);
    seen.notePeers([alice(view({}))]);
    seen.notePeers([top(cardRef('B'))]);
    expect(summary(seen.everyone)).toEqual([
      ['Alice', 'topCard', ['A']],
      ['Alice', 'topCard', ['B']],
      ['Alice', 'topCard', ['B']],
    ]);
  });

  it('a top card that returns after a gap in their view is not new', () => {
    const seen = list();
    seen.notePeers([alice(view({ topCard: cardRef('A') }))]);
    seen.notePeers([alice(null)]);
    seen.notePeers([alice(view({ topCard: cardRef('A') }))]);
    expect(seen.everyone).toHaveLength(1);
  });

  it('remembers only so many reveals shown to you', () => {
    const seen = list();
    const shown = (id: number) =>
      seen.noteShown('alice', 'Alice', {
        id,
        source: 'hand',
        cards: refs(`C${id}`),
      });
    for (let id = 0; id <= MAX_SEEN; id += 1) shown(id);
    expect(seen.you).toHaveLength(MAX_SEEN);
    // The newest key is still remembered; the oldest is long gone.
    expect(shown(MAX_SEEN)).toBe(false);
  });

  it('keeps entries of a player who left; their next reveal is new', () => {
    const seen = list();
    seen.notePeers([alice(revealed('hand', ['A']))]);
    seen.notePeers([]);
    seen.notePeers([alice(revealed('hand', ['A']))]);
    expect(seen.everyone).toHaveLength(2);
  });

  it('keeps players apart', () => {
    const seen = list();
    const bob = { playerId: 'bob', name: 'Bob', view: revealed('hand', ['A']) };
    seen.notePeers([alice(revealed('hand', ['A'])), bob]);
    expect(seen.everyone.map((e) => e.player)).toEqual(['alice', 'bob']);
  });

  it('caps the list', () => {
    const seen = list();
    for (let i = 0; i < MAX_SEEN + 5; i += 1) {
      seen.notePeers([alice(revealed('hand', [`C${i}`]))]);
    }
    expect(seen.everyone).toHaveLength(MAX_SEEN);
    expect(seen.everyone.at(-1)?.cards[0].name).toBe(`C${MAX_SEEN + 4}`);
  });
});

describe('the seen list of cards shown to you', () => {
  it('keeps them apart from public reveals, once per reveal', () => {
    const seen = list();
    const reveal = { id: 7, source: 'libraryTop' as const, cards: refs('A') };
    expect(seen.noteShown('alice', 'Alice', reveal)).toBe(true);
    expect(seen.noteShown('alice', 'Alice', reveal)).toBe(false);
    expect(seen.everyone).toEqual([]);
    expect(summary(seen.you)).toEqual([['Alice', 'libraryTop', ['A']]]);
    expect(seen.you[0].to).toBe('you');
  });

  it('clears both lists', () => {
    const seen = list();
    seen.noteShown('alice', 'Alice', {
      id: 1,
      source: 'hand',
      cards: refs('A'),
    });
    seen.notePeers([alice(revealed('hand', ['A']))]);
    expect(seen.clear()).toBe(true);
    expect(seen.everyone).toEqual([]);
    expect(seen.you).toEqual([]);
    expect(seen.clear()).toBe(false);
    // A cleared reveal still showing is seen again.
    seen.notePeers([alice(revealed('hand', ['A']))]);
    expect(seen.everyone).toHaveLength(1);
  });
});

describe('describeSeen', () => {
  const entry = (extra: Partial<SeenEntry>): SeenEntry => ({
    id: 1,
    player: 'alice',
    playerName: 'Alice',
    to: 'everyone',
    source: 'hand',
    cards: refs('A', 'B'),
    at: 0,
    ...extra,
  });

  it.each<[Partial<SeenEntry>, string]>([
    [{}, 'revealed their hand (2 cards)'],
    [{ source: 'libraryTop' }, 'revealed the top 2 cards of their library'],
    [{ source: 'topCard', cards: refs('A') }, 'had on top of their library'],
    [{ to: 'you', source: 'card' }, 'showed you 2 cards from their hand'],
  ])('%o', (extra, text) => {
    expect(describeSeen(entry(extra))).toBe(text);
  });
});
