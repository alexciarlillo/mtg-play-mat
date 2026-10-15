import { describe, expect, it } from 'vitest';

import type { CardRef } from '../game';
import type { Printing } from '../types/cards';
import {
  type CardFacts,
  type CardFactsFace,
  type Color,
  factsFromPrinting,
  matchesQuery,
  parseQuery,
  toSearchable,
} from '.';

interface Fixture {
  name: string;
  layout?: string;
  mv?: number;
  colors?: Color[];
  identity?: Color[];
  keywords?: string[];
  faces: CardFactsFace[];
  // A custom token or unknown printing: no facts at all.
  noFacts?: boolean;
}

const fixtures: Fixture[] = [
  {
    name: 'Lightning Bolt',
    mv: 1,
    colors: ['R'],
    identity: ['R'],
    faces: [
      {
        name: 'Lightning Bolt',
        typeLine: 'Instant',
        manaCost: '{R}',
        oracleText: 'Lightning Bolt deals 3 damage to any target.',
      },
    ],
  },
  {
    name: 'Llanowar Elves',
    mv: 1,
    colors: ['G'],
    identity: ['G'],
    faces: [
      {
        name: 'Llanowar Elves',
        typeLine: 'Creature — Elf Druid',
        manaCost: '{G}',
        oracleText: '{T}: Add {G}.',
        power: '1',
        toughness: '1',
      },
    ],
  },
  {
    name: 'Forest',
    mv: 0,
    colors: [],
    identity: ['G'],
    faces: [
      {
        name: 'Forest',
        typeLine: 'Basic Land — Forest',
        oracleText: '({T}: Add {G}.)',
      },
    ],
  },
  {
    name: 'Sol Ring',
    mv: 1,
    colors: [],
    identity: [],
    faces: [
      {
        name: 'Sol Ring',
        typeLine: 'Artifact',
        manaCost: '{1}',
        oracleText: '{T}: Add {C}{C}.',
      },
    ],
  },
  {
    name: 'Niv-Mizzet, Parun',
    mv: 6,
    colors: ['U', 'R'],
    identity: ['U', 'R'],
    keywords: ['Flying'],
    faces: [
      {
        name: 'Niv-Mizzet, Parun',
        typeLine: 'Legendary Creature — Dragon Wizard',
        manaCost: '{U}{U}{U}{R}{R}{R}',
        oracleText:
          'Flying\nWhenever you draw a card, Niv-Mizzet, Parun deals 1 ' +
          'damage to any target.',
        power: '5',
        toughness: '5',
      },
    ],
  },
  {
    name: 'Delver of Secrets // Insectile Aberration',
    layout: 'transform',
    mv: 1,
    colors: ['U'],
    identity: ['U'],
    keywords: ['Flying', 'Transform'],
    faces: [
      {
        name: 'Delver of Secrets',
        typeLine: 'Creature — Human Wizard',
        manaCost: '{U}',
        oracleText:
          'At the beginning of your upkeep, look at the top card of your ' +
          'library.',
        power: '1',
        toughness: '1',
      },
      {
        name: 'Insectile Aberration',
        typeLine: 'Creature — Human Insect',
        oracleText: 'Flying',
        power: '3',
        toughness: '2',
      },
    ],
  },
  {
    name: 'Fire // Ice',
    layout: 'split',
    mv: 4,
    colors: ['U', 'R'],
    identity: ['U', 'R'],
    faces: [
      {
        name: 'Fire',
        typeLine: 'Instant',
        manaCost: '{1}{R}',
        oracleText: 'Fire deals 2 damage divided as you choose.',
      },
      {
        name: 'Ice',
        typeLine: 'Instant',
        manaCost: '{1}{U}',
        oracleText: 'Tap target permanent.\nDraw a card.',
      },
    ],
  },
  {
    name: 'Tarmogoyf',
    mv: 2,
    colors: ['G'],
    identity: ['G'],
    faces: [
      {
        name: 'Tarmogoyf',
        typeLine: 'Creature — Lhurgoyf',
        manaCost: '{1}{G}',
        oracleText: "Tarmogoyf's power is equal to the number of card types.",
        power: '*',
        toughness: '1+*',
      },
    ],
  },
  {
    name: 'Golos, Tireless Pilgrim',
    mv: 5,
    colors: [],
    identity: ['W', 'U', 'B', 'R', 'G'],
    faces: [
      {
        name: 'Golos, Tireless Pilgrim',
        typeLine: 'Legendary Artifact Creature — Scout',
        manaCost: '{5}',
        oracleText: 'When Golos enters, you may search your library.',
        power: '3',
        toughness: '5',
      },
    ],
  },
  {
    name: "Lim-Dûl's Vault",
    mv: 2,
    colors: ['U', 'B'],
    identity: ['U', 'B'],
    faces: [
      {
        name: "Lim-Dûl's Vault",
        typeLine: 'Instant',
        manaCost: '{U}{B}',
        oracleText: 'Look at the top five cards of your library.',
      },
    ],
  },
  {
    name: 'Bird Spirit',
    noFacts: true,
    faces: [{ name: 'Bird Spirit', typeLine: 'Token Creature — Bird Spirit' }],
  },
];

const refOf = (fixture: Fixture): CardRef => ({
  id: fixture.noFacts ? '' : fixture.name,
  name: fixture.name,
  typeLine: fixture.faces.map((f) => f.typeLine).join(' // '),
  faces: fixture.faces.map(({ name, typeLine, power, toughness }) => ({
    name,
    typeLine,
    ...(power !== undefined && { power }),
    ...(toughness !== undefined && { toughness }),
  })),
  ...(fixture.layout && { layout: fixture.layout }),
  ...(fixture.noFacts && { custom: true as const }),
});

const factsOf = (fixture: Fixture): CardFacts | undefined =>
  fixture.noFacts
    ? undefined
    : {
        mv: fixture.mv ?? 0,
        colors: fixture.colors ?? [],
        colorIdentity: fixture.identity ?? [],
        keywords: fixture.keywords ?? [],
        faces: fixture.faces,
      };

const pool = fixtures.map((f) => ({
  name: f.name,
  card: toSearchable(refOf(f), factsOf(f)),
}));

const search = (text: string): string[] => {
  const { node, errors } = parseQuery(text);
  expect(errors).toEqual([]);
  return pool
    .filter(({ card }) => matchesQuery(node, card))
    .map(({ name }) => name);
};

const errorsOf = (text: string) =>
  parseQuery(text).errors.map((error) => error.message);

const ALL = fixtures.map((f) => f.name);

describe('bare words and phrases', () => {
  it('matches everything for an empty query', () => {
    expect(search('')).toEqual(ALL);
    expect(search('   ')).toEqual(ALL);
  });

  it('needs every word, in name, type line or oracle text', () => {
    expect(search('bolt')).toEqual(['Lightning Bolt']);
    expect(search('elf druid')).toEqual(['Llanowar Elves']);
    expect(search('upkeep')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('damage instant')).toEqual(['Lightning Bolt', 'Fire // Ice']);
  });

  it('keeps a quoted phrase together', () => {
    expect(search('"draw a card"')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
    ]);
    expect(search('"card draw"')).toEqual([]);
  });

  it('ignores case, accents and curly apostrophes', () => {
    expect(search('LIM-DUL’S')).toEqual(["Lim-Dûl's Vault"]);
  });

  it('matches an exact name with !', () => {
    expect(search('!"lightning bolt"')).toEqual(['Lightning Bolt']);
    expect(search('!lightning')).toEqual([]);
    expect(search('!fire')).toEqual(['Fire // Ice']);
  });
});

describe('keyword terms', () => {
  it('t: searches every face type line', () => {
    expect(search('t:basic')).toEqual(['Forest']);
    expect(search('t:insect')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('type:"legendary creature"')).toEqual(['Niv-Mizzet, Parun']);
  });

  it('o: searches oracle text of every face', () => {
    expect(search('o:"draw a card"')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
    ]);
    expect(search('oracle:{t}')).toEqual([
      'Llanowar Elves',
      'Forest',
      'Sol Ring',
    ]);
  });

  it('n: searches names, including face names', () => {
    expect(search('n:ice')).toEqual(['Fire // Ice']);
    expect(search('name:aberration')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
  });

  it('kw: searches keywords', () => {
    expect(search('kw:flying')).toEqual([
      'Niv-Mizzet, Parun',
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('keyword:trample')).toEqual([]);
  });

  it('accepts = for text keys', () => {
    expect(search('t=artifact')).toEqual([
      'Sol Ring',
      'Golos, Tireless Pilgrim',
    ]);
  });
});

describe('numbers', () => {
  it('compares mana value with every operator', () => {
    expect(search('mv:1')).toEqual([
      'Lightning Bolt',
      'Llanowar Elves',
      'Sol Ring',
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('mv=0')).toEqual(['Forest']);
    expect(search('cmc>=5')).toEqual([
      'Niv-Mizzet, Parun',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('mv>5')).toEqual(['Niv-Mizzet, Parun']);
    expect(search('mv<1')).toEqual(['Forest']);
    expect(search('mv<=1 t:creature')).toEqual([
      'Llanowar Elves',
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('t:instant mv!=1')).toEqual([
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
  });

  it('compares power and toughness on any face', () => {
    expect(search('pow>=3')).toEqual([
      'Niv-Mizzet, Parun',
      'Delver of Secrets // Insectile Aberration',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('tou=2')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
  });

  it('reads * as 0 and 1+* as 1', () => {
    expect(search('t:lhurgoyf pow=0 tou=1')).toEqual(['Tarmogoyf']);
  });

  it('never matches a card without the stat', () => {
    expect(search('pow<100')).not.toContain('Lightning Bolt');
  });
});

describe('colours (Scryfall semantics)', () => {
  it('c: means at least these colours', () => {
    expect(search('c:u')).toEqual([
      'Niv-Mizzet, Parun',
      'Delver of Secrets // Insectile Aberration',
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
    expect(search('c:ur')).toEqual(['Niv-Mizzet, Parun', 'Fire // Ice']);
    expect(search('c:izzet')).toEqual(['Niv-Mizzet, Parun', 'Fire // Ice']);
    expect(search('color:blue')).toEqual(search('c:u'));
  });

  it('c= is exact and c<= is at most', () => {
    expect(search('c=u')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('c<=ub -c:c')).toEqual([
      'Delver of Secrets // Insectile Aberration',
      "Lim-Dûl's Vault",
    ]);
    expect(search('c>u')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
    expect(search('c<ur')).toEqual([
      'Lightning Bolt',
      'Forest',
      'Sol Ring',
      'Delver of Secrets // Insectile Aberration',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('c!=g -c:c')).not.toContain('Llanowar Elves');
  });

  it('c:c is colourless and c:m is multicolour', () => {
    expect(search('c:c')).toEqual([
      'Forest',
      'Sol Ring',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('c:colorless')).toEqual(search('c:c'));
    expect(search('c:colourless')).toEqual(search('c:c'));
    expect(search('c:m')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
    expect(search('c!=m t:instant')).toEqual(['Lightning Bolt']);
  });

  it('id: means within this identity', () => {
    expect(search('id:g')).toEqual([
      'Llanowar Elves',
      'Forest',
      'Sol Ring',
      'Tarmogoyf',
    ]);
    expect(search('id:c')).toEqual(['Sol Ring']);
    expect(search('id>=ur')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('id=ur')).toEqual(['Niv-Mizzet, Parun', 'Fire // Ice']);
    expect(search('id:m')).toEqual([
      'Niv-Mizzet, Parun',
      'Fire // Ice',
      'Golos, Tireless Pilgrim',
      "Lim-Dûl's Vault",
    ]);
  });

  it('tells colour apart from identity', () => {
    expect(search('c:c id:wubrg t:creature')).toEqual([
      'Golos, Tireless Pilgrim',
    ]);
  });
});

describe('is:', () => {
  it('knows permanents, spells and historic cards', () => {
    expect(search('is:spell -is:permanent')).toEqual([
      'Lightning Bolt',
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
    expect(search('is:historic')).toEqual([
      'Sol Ring',
      'Niv-Mizzet, Parun',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('-is:spell')).toEqual(['Forest']);
  });

  it('knows layouts', () => {
    expect(search('is:dfc')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('is:transform')).toEqual(search('is:dfc'));
    expect(search('is:split')).toEqual(['Fire // Ice']);
    expect(search('is:mdfc')).toEqual([]);
  });
});

describe('logic', () => {
  it('negates a term with -', () => {
    expect(search('t:creature -t:legendary -c:g')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('-mv>=1')).toContain('Forest');
  });

  it('ors terms, binding looser than and', () => {
    expect(search('t:land or t:artifact c:c')).toEqual([
      'Forest',
      'Sol Ring',
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('bolt OR forest')).toEqual(['Lightning Bolt', 'Forest']);
    expect(search('t:instant or t:land mv=0')).toEqual([
      'Lightning Bolt',
      'Forest',
      'Fire // Ice',
      "Lim-Dûl's Vault",
    ]);
  });

  it('groups with parentheses, and negates groups', () => {
    expect(search('(t:instant or t:land) mv=0')).toEqual(['Forest']);
    expect(search('t:creature -(c:g or c:u)')).toEqual([
      'Golos, Tireless Pilgrim',
    ]);
    expect(search('((bolt))')).toEqual(['Lightning Bolt']);
  });

  it('allows an explicit and', () => {
    expect(search('t:creature and c:g')).toEqual(search('t:creature c:g'));
  });

  it('ends or before a closing parenthesis', () => {
    expect(errorsOf('(t:land or)')).toEqual(["Nothing after 'or'"]);
    const { node } = parseQuery('(t:land or)');
    expect(
      pool.filter(({ card }) => matchesQuery(node, card)).map((c) => c.name)
    ).toEqual(['Forest']);
  });

  it('accepts curly quotes', () => {
    expect(search('o:“draw a card”')).toEqual(search('o:"draw a card"'));
  });

  it('treats or and and as words only when whole', () => {
    expect(search('ord')).toEqual([]);
    expect(search('andros')).toEqual([]);
  });
});

describe('multi-face cards', () => {
  it('matches when any face does, per term', () => {
    expect(search('t:wizard pow=3')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
    expect(search('o:flying n:delver')).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
  });
});

describe('cards without facts', () => {
  it('match on name and type line only', () => {
    expect(search('bird')).toEqual(['Bird Spirit']);
    expect(search('t:token')).toEqual(['Bird Spirit']);
    expect(search('o:bird')).toEqual([]);
    expect(search('mv=0 t:token')).toEqual([]);
    expect(search('c:c t:token')).toEqual([]);
    expect(search('kw:flying t:token')).toEqual([]);
  });

  it('match no negated fact term either', () => {
    expect(search('t:token -c:r')).toEqual([]);
    expect(search('t:token -o:bird')).toEqual([]);
    expect(search('t:token -(c:r or mv>3)')).toEqual([]);
    expect(search('-t:creature t:token')).toEqual([]);
    expect(search('t:token -t:legendary -pow>5')).toEqual(['Bird Spirit']);
  });

  it('fall back to the ref itself when it has no faces', () => {
    const card = toSearchable({
      id: '',
      name: 'Clue',
      typeLine: 'Token Artifact — Clue',
      faces: [],
    });
    expect(matchesQuery(parseQuery('t:clue').node, card)).toBe(true);
  });
});

describe('errors', () => {
  it('reports an unknown keyword and drops that term', () => {
    const parsed = parseQuery('t:creature foo:bar');
    expect(parsed.errors).toEqual([
      { message: "Unknown keyword 'foo'", start: 11, end: 14 },
    ]);
    expect(parsed.node).toEqual({
      kind: 'text',
      field: 'type',
      value: 'creature',
    });
  });

  it('reports bad values and operators', () => {
    expect(errorsOf('mv<=')).toEqual(["A value goes after 'mv<='"]);
    expect(errorsOf('mv:x')).toEqual(["'mv' needs a number"]);
    expect(errorsOf('mv:0x3')).toEqual(["'mv' needs a number"]);
    expect(errorsOf('mv:1e0')).toEqual(["'mv' needs a number"]);
    expect(search('mv<1.5 mv>-1 t:land')).toEqual(['Forest']);
    expect(errorsOf('t>creature')).toEqual(["'t' only takes ':'"]);
    expect(errorsOf('c:purple')).toEqual(["Unknown colour 'purple'"]);
    expect(errorsOf('c<m')).toEqual(["'m' only takes ':'"]);
    expect(errorsOf('is:cool')).toEqual(["Unknown 'is:' value 'cool'"]);
    expect(errorsOf('is<permanent')).toEqual(["'is' only takes ':'"]);
  });

  it('reports structural mistakes', () => {
    expect(errorsOf('(t:land')).toEqual(["Missing ')'"]);
    expect(errorsOf('t:land)')).toEqual(["Unmatched ')'"]);
    expect(errorsOf('()')).toEqual(['Empty parentheses']);
    expect(errorsOf('o:"draw')).toEqual(['Missing closing quote']);
    expect(errorsOf('t:land or')).toEqual(["Nothing after 'or'"]);
    expect(errorsOf('or t:land')).toEqual(["Nothing before 'or'"]);
    expect(errorsOf('t:land -')).toEqual(["Nothing to exclude after '-'"]);
    expect(errorsOf('!')).toEqual(["A card name goes after '!'"]);
  });

  it('still filters on the valid parts', () => {
    const { node } = parseQuery('(t:land');
    expect(
      pool.filter(({ card }) => matchesQuery(node, card)).map((c) => c.name)
    ).toEqual(['Forest']);
  });
});

describe('factsFromPrinting', () => {
  const printing = (patch: Partial<Printing>): Printing => ({
    id: 'p1',
    oracleId: 'o1',
    name: 'Card',
    lang: 'en',
    setCode: 'xxx',
    setName: 'Set',
    collectorNumber: '1',
    releasedAt: null,
    layout: 'normal',
    typeLine: 'Instant',
    manaCost: '{R}',
    cmc: 1,
    colors: ['R'],
    colorIdentity: ['R'],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    keywords: [],
    oracleText: 'Deal damage.',
    rarity: 'common',
    digital: false,
    faces: [
      {
        name: 'Card',
        typeLine: 'Instant',
        manaCost: '{R}',
        oracleText: 'Deal damage.',
        image: 'https://example.test/x.jpg',
      },
    ],
    ...patch,
  });

  it('keeps the search fields and drops images', () => {
    expect(factsFromPrinting(printing({}))).toEqual({
      mv: 1,
      colors: ['R'],
      colorIdentity: ['R'],
      keywords: [],
      faces: [
        {
          name: 'Card',
          typeLine: 'Instant',
          manaCost: '{R}',
          oracleText: 'Deal damage.',
        },
      ],
    });
  });

  it('takes colours from face mana costs when the card has none', () => {
    const facts = factsFromPrinting(
      printing({
        layout: 'modal_dfc',
        colors: [],
        colorIdentity: ['G', 'U'],
        cmc: null,
        faces: [
          { name: 'Front', typeLine: 'Sorcery', manaCost: '{2}{G/U}' },
          { name: 'Back', typeLine: 'Land' },
        ],
      })
    );
    expect(facts.colors).toEqual(['U', 'G']);
    expect(facts.colorIdentity).toEqual(['U', 'G']);
    expect(facts.mv).toBe(0);
  });

  it('keeps a devoid card colourless despite its mana cost', () => {
    const facts = factsFromPrinting(
      printing({
        name: 'Ruination Guide',
        manaCost: '{2}{U}',
        cmc: 3,
        colors: [],
        colorIdentity: ['U'],
        keywords: ['Devoid'],
        faces: [
          { name: 'Ruination Guide', typeLine: 'Creature', manaCost: '{2}{U}' },
        ],
      })
    );
    expect(facts.colors).toEqual([]);
    expect(facts.colorIdentity).toEqual(['U']);
  });
});
