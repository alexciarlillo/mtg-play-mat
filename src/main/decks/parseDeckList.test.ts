// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCardText, parseDeckList } from './parseDeckList';

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const summary = (text: string) =>
  parseDeckList(text).cards.map((c) => [c.qty, c.name, c.board]);

describe('parseCardText', () => {
  it.each([
    ['4 Lightning Bolt', { qty: 4, name: 'Lightning Bolt' }],
    ['4x Lightning Bolt', { qty: 4, name: 'Lightning Bolt' }],
    ['4 x Lightning Bolt', { qty: 4, name: 'Lightning Bolt' }],
    ['Lightning Bolt', { qty: 1, name: 'Lightning Bolt' }],
    ['1 Xenagos, the Reveler', { qty: 1, name: 'Xenagos, the Reveler' }],
    [
      '4 Lightning Bolt (M10) 146',
      { qty: 4, name: 'Lightning Bolt', setCode: 'M10', number: '146' },
    ],
    [
      '1 Grizzly Bears [10e]',
      { qty: 1, name: 'Grizzly Bears', setCode: '10e' },
    ],
    [
      '1 Sol Ring (C21) 263 *F*',
      {
        qty: 1,
        name: 'Sol Ring',
        setCode: 'C21',
        number: '263',
        finish: 'foil',
      },
    ],
    [
      '1 Counterspell (MH2) 267 *E*',
      {
        qty: 1,
        name: 'Counterspell',
        setCode: 'MH2',
        number: '267',
        finish: 'etched',
      },
    ],
    [
      '1 Delver of Secrets // Insectile Aberration (ISD) 51',
      {
        qty: 1,
        name: 'Delver of Secrets // Insectile Aberration',
        setCode: 'ISD',
        number: '51',
      },
    ],
    [
      '1 Thing (PLST) C21-263',
      { qty: 1, name: 'Thing', setCode: 'PLST', number: 'C21-263' },
    ],
    [
      '1 Sol Ring (SLD) 1011★',
      { qty: 1, name: 'Sol Ring', setCode: 'SLD', number: '1011★' },
    ],
    [
      '1 Island (UST) 213a',
      { qty: 1, name: 'Island', setCode: 'UST', number: '213a' },
    ],
    ['1 Sol Ring #Ramp #Artifacts', { qty: 1, name: 'Sol Ring' }],
    [
      '1 Erase (Not the Urza’s Legacy One)',
      { qty: 1, name: 'Erase (Not the Urza’s Legacy One)' },
    ],
  ])('%s', (text, expected) => {
    expect(parseCardText(text)).toEqual(expected);
  });
});

describe('parseDeckList', () => {
  it('reads plain lists into the main board', () => {
    expect(summary('4 Forest\n2x Llanowar Elves\r\n')).toEqual([
      [4, 'Forest', 'main'],
      [2, 'Llanowar Elves', 'main'],
    ]);
  });

  it('handles Deck, Sideboard, Commander, and Companion headers', () => {
    const text = [
      'Commander',
      '1 Atraxa',
      'Companion',
      '1 Lurrus',
      'Deck',
      '4 Forest',
      'SIDEBOARD:',
      '2 Duress',
    ].join('\n');
    expect(summary(text)).toEqual([
      [1, 'Atraxa', 'commander'],
      [1, 'Lurrus', 'side'],
      [4, 'Forest', 'main'],
      [2, 'Duress', 'side'],
    ]);
  });

  it('accepts header variants: case, colons, counts, and // prefixes', () => {
    const text = [
      'COMMANDER:',
      '1 Atraxa',
      '// Mainboard',
      '4 Forest',
      'Sideboard (15)',
      '2 Duress',
    ].join('\n');
    expect(summary(text)).toEqual([
      [1, 'Atraxa', 'commander'],
      [4, 'Forest', 'main'],
      [2, 'Duress', 'side'],
    ]);
  });

  it('skips type category headers without changing boards', () => {
    expect(summary('Creatures (4)\n4 Llanowar Elves\nLands\n4 Forest')).toEqual(
      [
        [4, 'Llanowar Elves', 'main'],
        [4, 'Forest', 'main'],
      ]
    );
  });

  it('ignores and reports maybeboard and considering lines', () => {
    const result = parseDeckList(
      '4 Forest\nMaybeboard\n1 Ugin\nConsidering\n1 Basri Ket'
    );
    expect(result.cards.map((c) => c.name)).toEqual(['Forest']);
    expect(result.ignored).toEqual([
      { line: 3, text: '1 Ugin', reason: 'maybeboard' },
      { line: 5, text: '1 Basri Ket', reason: 'maybeboard' },
    ]);
    expect(result.notes).toContain('Skipped 2 maybeboard line(s).');
  });

  it('takes the deck name from About/Name and ignores other About lines', () => {
    const result = parseDeckList(
      'About\nName Angels\nAuthor someone\n\nDeck\n4 Forest'
    );
    expect(result.deckName).toBe('Angels');
    expect(result.ignored).toEqual([
      { line: 3, text: 'Author someone', reason: 'about' },
    ]);
    expect(result.cards).toHaveLength(1);
  });

  it('treats the group after the last blank line as the MTGA sideboard', () => {
    const result = parseDeckList('Deck\n4 Forest\n4 Island\n\n2 Duress\n');
    expect(result.cards.map((c) => c.board)).toEqual(['main', 'main', 'side']);
    expect(result.notes[0]).toMatch(/after the last blank line.*line 5/);
  });

  it('keeps blank-separated groups in the main board with a sideboard header', () => {
    const result = parseDeckList('4 Forest\n\n4 Island\n\nSideboard\n2 Duress');
    expect(result.cards.map((c) => c.board)).toEqual(['main', 'main', 'side']);
    expect(result.notes).toEqual([]);
  });

  it('never treats commanders as an implied sideboard', () => {
    const result = parseDeckList('Commander\n1 Atraxa\n\nDeck\n1 Sol Ring');
    expect(result.cards.map((c) => c.board)).toEqual(['commander', 'main']);
  });

  it('reads MTGO SB: prefixes as sideboard cards', () => {
    expect(summary('4 Forest\nSB: 2 Duress')).toEqual([
      [4, 'Forest', 'main'],
      [2, 'Duress', 'side'],
    ]);
  });

  it('reports comments and zero quantities', () => {
    const result = parseDeckList('// my list\n0 Forest\n1 Island');
    expect(result.ignored.map((i) => i.reason)).toEqual(['comment', 'zero']);
    expect(result.cards.map((c) => c.line)).toEqual([3]);
  });

  it('parses a Moxfield Commander export', () => {
    const result = parseDeckList(fixture('moxfield-commander.txt'));
    const boards = result.cards.reduce<Record<string, number>>((acc, c) => {
      acc[c.board] = (acc[c.board] ?? 0) + c.qty;
      return acc;
    }, {});
    expect(boards).toEqual({ commander: 1, main: 30 });
    expect(result.cards[0]).toMatchObject({
      name: "Atraxa, Praetors' Voice",
      setCode: 'C16',
      number: '28',
      finish: 'foil',
    });
    expect(result.ignored).toHaveLength(2);
    expect(result.notes).toEqual(['Skipped 2 maybeboard line(s).']);
  });

  it('parses an MTGA export with a blank-line sideboard', () => {
    const result = parseDeckList(fixture('mtga.txt'));
    expect(result.deckName).toBe('Mono-White Angels');
    const count = (board: string) =>
      result.cards
        .filter((c) => c.board === board)
        .reduce((n, c) => n + c.qty, 0);
    expect(count('main')).toBe(60);
    expect(count('side')).toBe(5);
  });
});
