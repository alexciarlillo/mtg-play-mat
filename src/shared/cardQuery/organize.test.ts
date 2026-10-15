import { describe, expect, it } from 'vitest';

import type { CardView } from '../game';
import {
  allOf,
  type CardFacts,
  type CardGroup,
  type Chips,
  chipCount,
  chipsToQuery,
  type Color,
  countBy,
  emptyChips,
  matchesQuery,
  organize,
  type OrganizeOptions,
  parseQuery,
  sortCards,
  subtypesOf,
  toSearchable,
} from '.';

let next = 0;

const card = (
  name: string,
  typeLine: string,
  patch: Partial<CardView> = {}
): CardView => {
  next += 1;
  return {
    instanceId: `p1:${String(next).padStart(3, '0')}`,
    ref: { id: `id-${name}`, name, typeLine, faces: [{ name, typeLine }] },
    owner: 'p1',
    controller: 'p1',
    zone: 'graveyard',
    position: null,
    tapped: false,
    faceDown: false,
    faceIndex: 0,
    counters: {},
    isToken: false,
    attachedTo: null,
    ...patch,
  };
};

const factsTable: Record<string, { mv: number; colors: Color[] }> = {
  Forest: { mv: 0, colors: [] },
  'Llanowar Elves': { mv: 1, colors: ['G'] },
  'Grizzly Bears': { mv: 2, colors: ['G'] },
  'Lightning Bolt': { mv: 1, colors: ['R'] },
  'Boros Charm': { mv: 2, colors: ['R', 'W'] },
  'Colossal Dreadmaw': { mv: 6, colors: ['G'] },
  'Emrakul, the Aeons Torn': { mv: 15, colors: [] },
};

const facts = (id: string): CardFacts | undefined => {
  const entry = factsTable[id.replace(/^id-/, '')];
  return (
    entry && {
      ...entry,
      colorIdentity: entry.colors,
      keywords: [],
      faces: [],
    }
  );
};

const forest = () => card('Forest', 'Basic Land — Forest');
const elves = () => card('Llanowar Elves', 'Creature — Elf Druid');
const bears = () => card('Grizzly Bears', 'Creature — Bear');
const bolt = () => card('Lightning Bolt', 'Instant');
const charm = () => card('Boros Charm', 'Instant');
const dreadmaw = () => card('Colossal Dreadmaw', 'Creature — Dinosaur');
const emrakul = () => card('Emrakul, the Aeons Torn', 'Legendary Creature');
const token = () =>
  card('Spirit', 'Token Creature — Spirit', {
    ref: {
      id: '',
      name: 'Spirit',
      typeLine: 'Token Creature — Spirit',
      faces: [],
      custom: true,
    },
    isToken: true,
  });

const options = (patch: Partial<OrganizeOptions> = {}): OrganizeOptions => ({
  sort: 'name',
  group: 'none',
  stack: false,
  hideOrder: false,
  ...patch,
});

const names = (cards: CardView[]) => cards.map((c) => c.ref?.name);

const shape = (groups: CardGroup[]) =>
  groups.map((group) => ({
    label: group.label,
    count: group.count,
    stacks: group.stacks.map(
      (s) => `${s.cards[0]?.ref?.name ?? '?'} x${s.cards.length}`
    ),
  }));

describe('sortCards', () => {
  // Zone order: the last card is the newest.
  const zone = [bears(), forest(), bolt(), dreadmaw(), charm(), token()];

  it('sorts by name', () => {
    expect(names(sortCards(zone, facts, options()))).toEqual([
      'Boros Charm',
      'Colossal Dreadmaw',
      'Forest',
      'Grizzly Bears',
      'Lightning Bolt',
      'Spirit',
    ]);
  });

  it('sorts by mana value, unknown last, then name', () => {
    expect(names(sortCards(zone, facts, options({ sort: 'mv' })))).toEqual([
      'Forest',
      'Lightning Bolt',
      'Boros Charm',
      'Grizzly Bears',
      'Colossal Dreadmaw',
      'Spirit',
    ]);
  });

  it('sorts by type group, then name', () => {
    expect(names(sortCards(zone, facts, options({ sort: 'type' })))).toEqual([
      'Colossal Dreadmaw',
      'Grizzly Bears',
      'Spirit',
      'Boros Charm',
      'Lightning Bolt',
      'Forest',
    ]);
  });

  it('sorts by colour: WUBRG, multicolour, colourless, unknown', () => {
    expect(names(sortCards(zone, facts, options({ sort: 'color' })))).toEqual([
      'Lightning Bolt',
      'Colossal Dreadmaw',
      'Grizzly Bears',
      'Boros Charm',
      'Forest',
      'Spirit',
    ]);
  });

  it('sorts newest first by zone order', () => {
    expect(names(sortCards(zone, facts, options({ sort: 'newest' })))).toEqual([
      'Spirit',
      'Boros Charm',
      'Colossal Dreadmaw',
      'Lightning Bolt',
      'Forest',
      'Grizzly Bears',
    ]);
  });

  it('never shows the order of a hidden zone', () => {
    const a = forest();
    const b = forest();
    const c = bears();
    const hidden = options({ sort: 'newest', hideOrder: true });
    const one = sortCards([a, b, c], facts, hidden);
    const two = sortCards([c, b, a], facts, hidden);
    expect(one).toEqual(two);
    expect(names(one)).toEqual(['Forest', 'Forest', 'Grizzly Bears']);
    expect(one[0]?.instanceId).toBe(a.instanceId);
  });

  it('breaks ties newest first when the order is public', () => {
    const a = forest();
    const b = forest();
    expect(sortCards([a, b], facts, options())).toEqual([b, a]);
  });
});

describe('organize', () => {
  it('stacks identical printings into one tile', () => {
    const forests = Array.from({ length: 24 }, forest);
    const groups = organize(
      [...forests, elves(), bears()],
      facts,
      options({ stack: true, hideOrder: true })
    );
    expect(shape(groups)).toEqual([
      {
        label: 'All',
        count: 26,
        stacks: ['Forest x24', 'Grizzly Bears x1', 'Llanowar Elves x1'],
      },
    ]);
    expect(groups[0]?.stacks[0]?.cards).toHaveLength(24);
  });

  it('keeps cards apart when stacking is off', () => {
    const groups = organize([forest(), forest()], facts, options());
    expect(shape(groups)[0]?.stacks).toEqual(['Forest x1', 'Forest x1']);
  });

  it('only stacks cards in the same state', () => {
    const plain = forest();
    const countered = forest();
    countered.counters = { '+1/+1': 1 };
    const flipped = forest();
    flipped.faceDown = true;
    const again = forest();
    const groups = organize(
      [plain, countered, flipped, again],
      facts,
      options({ stack: true, sort: 'newest' })
    );
    expect(groups[0]?.stacks.map((s) => s.cards)).toEqual([
      [again, plain],
      [flipped],
      [countered],
    ]);
  });

  it('groups by type in type order', () => {
    const groups = organize(
      [forest(), bolt(), bears(), forest(), elves()],
      facts,
      options({ group: 'type', stack: true })
    );
    expect(shape(groups)).toEqual([
      {
        label: 'Creature',
        count: 2,
        stacks: ['Grizzly Bears x1', 'Llanowar Elves x1'],
      },
      { label: 'Instant', count: 1, stacks: ['Lightning Bolt x1'] },
      { label: 'Land', count: 2, stacks: ['Forest x2'] },
    ]);
  });

  it('groups by mana value with 7+ and unknown buckets', () => {
    const groups = organize(
      [emrakul(), token(), bears(), forest(), charm(), dreadmaw()],
      facts,
      options({ group: 'mv' })
    );
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['MV 0', 1],
      ['MV 2', 2],
      ['MV 6', 1],
      ['MV 7+', 1],
      ['Unknown', 1],
    ]);
  });

  it('groups by colour', () => {
    const groups = organize(
      [forest(), charm(), bolt(), bears(), token()],
      facts,
      options({ group: 'color' })
    );
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Red', 1],
      ['Green', 1],
      ['Multicolour', 1],
      ['Colourless', 1],
      ['Unknown', 1],
    ]);
  });
});

describe('countBy', () => {
  const zone = [forest(), forest(), bears(), elves(), bolt(), dreadmaw()];

  it('counts per type', () => {
    expect(
      countBy(zone, facts, 'type').map(({ label, count }) => [label, count])
    ).toEqual([
      ['Creature', 3],
      ['Instant', 1],
      ['Land', 2],
    ]);
  });

  it('counts per mana value', () => {
    expect(
      countBy(zone, facts, 'mv').map(({ label, count }) => [label, count])
    ).toEqual([
      ['MV 0', 2],
      ['MV 1', 2],
      ['MV 2', 1],
      ['MV 6', 1],
    ]);
  });
});

describe('chips', () => {
  const zone = [forest(), bears(), elves(), bolt(), charm(), dreadmaw()];
  const shown = (chips: Partial<Chips>, text = '') =>
    zone
      .filter((c) =>
        matchesQuery(
          allOf(
            parseQuery(text).node,
            chipsToQuery({ ...emptyChips, ...chips })
          ),
          toSearchable(c.ref!, facts(c.ref!.id))
        )
      )
      .map((c) => c.ref?.name);

  it('match everything when empty', () => {
    expect(chipsToQuery(emptyChips)).toBeNull();
    expect(chipCount(emptyChips)).toBe(0);
    expect(shown({})).toHaveLength(zone.length);
  });

  it('builds the same tree the text box parses', () => {
    expect(
      chipsToQuery({ ...emptyChips, types: ['Creature', 'Land'] })
    ).toEqual(parseQuery('t:creature or t:land').node);
    expect(
      chipsToQuery({
        ...emptyChips,
        types: ['Creature'],
        mv: { op: '<=', value: 3 },
      })
    ).toEqual(parseQuery('t:creature mv<=3').node);
    expect(
      chipsToQuery({ ...emptyChips, colors: ['G'], colorMode: 'includes' })
    ).toEqual(parseQuery('c:g').node);
    expect(
      chipsToQuery({ ...emptyChips, colors: ['G'], colorMode: 'atMost' })
    ).toEqual(parseQuery('c<=g').node);
    expect(
      chipsToQuery({ ...emptyChips, colors: ['R', 'W'], colorMode: 'exactly' })
    ).toEqual(parseQuery('c=rw').node);
    expect(chipsToQuery({ ...emptyChips, colorless: true })).toEqual(
      parseQuery('c:c').node
    );
    expect(chipsToQuery({ ...emptyChips, subtype: 'Elf' })).toEqual({
      kind: 'subtype',
      value: 'elf',
    });
  });

  it('ORs types and ANDs everything else', () => {
    expect(shown({ types: ['Creature', 'Instant'] })).toEqual([
      'Grizzly Bears',
      'Llanowar Elves',
      'Lightning Bolt',
      'Boros Charm',
      'Colossal Dreadmaw',
    ]);
    expect(shown({ types: ['Creature'], mv: { op: '<=', value: 2 } })).toEqual([
      'Grizzly Bears',
      'Llanowar Elves',
    ]);
    expect(shown({ mv: { op: '>=', value: 2 } })).toEqual([
      'Grizzly Bears',
      'Boros Charm',
      'Colossal Dreadmaw',
    ]);
  });

  it('match colours by includes, exactly or at most', () => {
    expect(shown({ colors: ['R'], colorMode: 'includes' })).toEqual([
      'Lightning Bolt',
      'Boros Charm',
    ]);
    expect(shown({ colors: ['R'], colorMode: 'exactly' })).toEqual([
      'Lightning Bolt',
    ]);
    expect(shown({ colors: ['R', 'W'], colorMode: 'atMost' })).toEqual([
      'Forest',
      'Lightning Bolt',
      'Boros Charm',
    ]);
    expect(shown({ colorless: true })).toEqual(['Forest']);
  });

  it('AND with the text query', () => {
    expect(shown({ types: ['Creature'] }, 'c:g mv>1')).toEqual([
      'Grizzly Bears',
      'Colossal Dreadmaw',
    ]);
    expect(shown({ types: ['Creature'] }, 'charm')).toEqual([]);
  });

  it('count each kind of filter once', () => {
    expect(
      chipCount({
        ...emptyChips,
        types: ['Creature', 'Land'],
        subtype: 'Elf',
        mv: { op: '=', value: 1 },
        colors: ['G', 'R'],
      })
    ).toBe(5);
  });
});

describe('subtype chip', () => {
  const matches = (subtype: string, typeLine: string) =>
    matchesQuery(
      chipsToQuery({ ...emptyChips, subtype }),
      toSearchable(card('X', typeLine).ref!)
    );

  it('matches whole subtypes after the dash only', () => {
    expect(matches('Orc', 'Creature — Orc Warrior')).toBe(true);
    expect(matches('Orc', 'Sorcery')).toBe(false);
    expect(matches('Orc', 'Creature — Orcish Horde')).toBe(false);
    expect(matches('Ox', 'Creature — Fox')).toBe(false);
    expect(matches('Rat', 'Creature — Human Pirate')).toBe(false);
    expect(matches('Ant', 'Creature — Giant')).toBe(false);
    expect(matches('Giant', 'Creature — Giant')).toBe(true);
  });

  it('matches any face', () => {
    expect(
      matches('Insect', 'Creature — Human Wizard // Creature — Human Insect')
    ).toBe(true);
  });
});

describe('subtypesOf', () => {
  it('collects subtypes from every face, sorted and unique', () => {
    expect(
      subtypesOf([
        'Creature — Elf Druid',
        'Basic Land — Forest',
        'Instant',
        'Creature — Human Wizard // Creature — Human Insect',
        'Creature — Elf Warrior',
      ])
    ).toEqual([
      'Druid',
      'Elf',
      'Forest',
      'Human',
      'Insect',
      'Warrior',
      'Wizard',
    ]);
  });
});
