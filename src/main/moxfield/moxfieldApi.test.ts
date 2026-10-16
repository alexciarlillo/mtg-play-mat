// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { deckFixture, readFixture, SATORU, SLIMEFOOT } from './fixtures';
import { MoxfieldError, parseDeck, parseSearchPage } from './moxfieldApi';

const kindOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof MoxfieldError ? err.kind : 'other';
  }
  return 'none';
};

describe('parseSearchPage', () => {
  it("reads a user's public decks", () => {
    const page = parseSearchPage(readFixture('search'), 'aciarlillo');
    expect(page).toEqual({
      totalPages: 1,
      totalResults: 2,
      decks: [
        {
          publicId: SATORU,
          name: 'Satoru Home Wrecker',
          lastUpdatedAt: '2023-03-13T00:56:39.627Z',
        },
        {
          publicId: SLIMEFOOT,
          name: 'Slimefoot Aristocrats',
          lastUpdatedAt: '2022-10-27T15:04:03.913Z',
        },
      ],
    });
  });

  it('matches the username ignoring case', () => {
    expect(
      parseSearchPage(readFixture('search'), 'ACIarlillo').decks
    ).toHaveLength(2);
  });

  // An unknown username gets everyone's decks back, not an error.
  it('refuses decks by someone else as an unknown user', () => {
    expect(() =>
      parseSearchPage(readFixture('search-unknown-user'), 'nobody-here')
    ).toThrow(/no public decks by "nobody-here"/);
    expect(
      kindOf(() =>
        parseSearchPage(readFixture('search-unknown-user'), 'nobody-here')
      )
    ).toBe('notFound');
  });

  it('skips decks by others when some are theirs', () => {
    const page = readFixture('search');
    const [first] = page.data as Record<string, unknown>[];
    first.createdByUser = { userName: 'someone' };
    first.authors = [];
    expect(
      parseSearchPage(page, 'aciarlillo').decks.map((d) => d.name)
    ).toEqual(['Slimefoot Aristocrats']);
  });

  it('reads an empty page as no decks', () => {
    const page = readFixture('search');
    page.data = [];
    page.totalResults = 0;
    expect(parseSearchPage(page, 'aciarlillo').decks).toEqual([]);
  });

  it('accepts a co-author', () => {
    const page = readFixture('search');
    const [first] = page.data as Record<string, unknown>[];
    first.createdByUser = { userName: 'someone' };
    first.authors = [{ userName: 'someone' }, { userName: 'aciarlillo' }];
    expect(parseSearchPage(page, 'aciarlillo').decks).toHaveLength(2);
  });

  it('refuses a page that is not shaped as expected', () => {
    const bad = (change: (p: Record<string, unknown>) => void) => {
      const page = readFixture('search');
      change(page);
      return kindOf(() => parseSearchPage(page, 'aciarlillo'));
    };
    const first = (p: Record<string, unknown>) =>
      (p.data as Record<string, unknown>[])[0];
    expect(bad((p) => delete p.totalPages)).toBe('schema');
    expect(bad((p) => (p.totalResults = '2'))).toBe('schema');
    expect(bad((p) => (p.data = {}))).toBe('schema');
    expect(bad((p) => (p.data = Array(51).fill(first(p))))).toBe('schema');
    expect(bad((p) => (first(p).publicId = '../../x'))).toBe('schema');
    expect(bad((p) => (first(p).publicId = 7))).toBe('schema');
    expect(bad((p) => (first(p).name = ''))).toBe('schema');
    expect(bad((p) => (first(p).lastUpdatedAtUtc = 'yesterday'))).toBe(
      'schema'
    );
    expect(bad((p) => delete first(p).createdByUser)).toBe('schema');
    expect(bad(() => undefined)).toBe('none');
  });
});

describe('parseDeck', () => {
  it('reads the boards a play test uses, and nothing else', () => {
    const deck = parseDeck(deckFixture(SATORU), SATORU);
    expect(deck).toMatchObject({
      publicId: SATORU,
      name: 'Satoru Home Wrecker',
      format: 'commander',
      author: 'aciarlillo',
      lastUpdatedAt: '2023-03-13T00:56:39.627Z',
      mainScryfallId: '983abbf8-4966-47ae-9e72-72f400a49f3b',
    });
    expect(deck.cards.map((c) => `${c.board} ${c.qty} ${c.name}`)).toEqual([
      'commander 1 Satoru Umezawa',
      'main 7 Island',
      'main 7 Swamp',
      'main 1 Temple of Deceit',
      'main 1 Arcane Signet',
      'main 1 Command Tower',
      'main 1 Arcane Denial',
    ]);
    expect(deck.cards[0]).toEqual({
      board: 'commander',
      qty: 1,
      name: 'Satoru Umezawa',
      scryfallId: '8887f26d-b097-4fbc-9c48-bdc656409a32',
      setCode: 'neo',
      number: '234',
    });
  });

  const withFirstCard = (change: (card: Record<string, unknown>) => void) => {
    const json = deckFixture(SLIMEFOOT);
    const boards = json.boards as Record<string, { cards: object }>;
    const entry = Object.values(boards.mainboard.cards)[0] as Record<
      string,
      unknown
    >;
    change(entry);
    return json;
  };

  it('drops odd lookup hints and cleans names', () => {
    const json = withFirstCard((entry) => {
      const card = entry.card as Record<string, unknown>;
      card.scryfall_id = 'not-a-uuid';
      card.set = 'a set!';
      card.cn = 7;
      card.name = 'Forest\u0007';
    });
    const card = parseDeck(json, SLIMEFOOT).cards[1];
    expect(card).toEqual({
      board: 'main',
      qty: 7,
      name: 'Forest',
      scryfallId: undefined,
      setCode: undefined,
      number: undefined,
    });
  });

  it('skips zero quantities and caps huge ones', () => {
    expect(
      parseDeck(
        withFirstCard((e) => (e.quantity = 0)),
        SLIMEFOOT
      ).cards.some((c) => c.name === 'Forest')
    ).toBe(false);
    expect(
      parseDeck(
        withFirstCard((e) => (e.quantity = 5000)),
        SLIMEFOOT
      ).cards[1].qty
    ).toBe(999);
  });

  it('treats a board Moxfield left out as empty', () => {
    const json = deckFixture(SLIMEFOOT);
    delete (json.boards as Record<string, unknown>).sideboard;
    delete (json.boards as Record<string, unknown>).companions;
    expect(parseDeck(json, SLIMEFOOT).cards).toHaveLength(7);
  });

  it('refuses a deck that is not shaped as expected', () => {
    const bad = (json: unknown, id = SLIMEFOOT) =>
      kindOf(() => parseDeck(json, id));
    expect(bad(deckFixture(SLIMEFOOT), SATORU)).toBe('schema');
    expect(bad([])).toBe('schema');
    expect(bad(withFirstCard((e) => (e.quantity = '7')))).toBe('schema');
    expect(bad(withFirstCard((e) => (e.quantity = -1)))).toBe('schema');
    expect(bad(withFirstCard((e) => (e.quantity = 1.5)))).toBe('schema');
    expect(bad(withFirstCard((e) => delete e.card))).toBe('schema');
    expect(
      bad(withFirstCard((e) => ((e.card as { name: unknown }).name = null)))
    ).toBe('schema');
    const noMain = deckFixture(SLIMEFOOT);
    delete (noMain.boards as Record<string, unknown>).mainboard;
    expect(bad(noMain)).toBe('schema');
    const huge = deckFixture(SLIMEFOOT);
    const many = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [
        `k${i}`,
        { quantity: 1, card: { name: `Card ${i}` } },
      ])
    );
    (huge.boards as Record<string, unknown>).sideboard = { cards: many };
    expect(bad(huge)).toBe('schema');
  });
});
