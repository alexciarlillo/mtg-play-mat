import type { CardFacts } from '@shared/cardQuery';
import type { CardFace, CardRef } from '@shared/game';

interface SampleCard {
  copies: number;
  id: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  layout?: string;
  // Sideboard cards stay out of the 60.
  side?: true;
  // Multi-face cards list every face; others use the card itself.
  faces?: CardFace[];
  // Search data, standing in for the card database.
  facts: Omit<CardFacts, 'faces'> & { oracleText?: string[] };
}

const sampleCards: SampleCard[] = [
  {
    copies: 24,
    id: '3279314f-d639-4489-b2ab-3621bb3ca64b',
    name: 'Forest',
    typeLine: 'Basic Land — Forest',
    facts: {
      mv: 0,
      colors: [],
      colorIdentity: ['G'],
      keywords: [],
      oracleText: ['({T}: Add {G}.)'],
    },
  },
  {
    copies: 12,
    id: '73542493-cd0b-4bb7-a5b8-8f889c76e4d6',
    name: 'Llanowar Elves',
    typeLine: 'Creature — Elf Druid',
    power: '1',
    toughness: '1',
    facts: {
      mv: 1,
      colors: ['G'],
      colorIdentity: ['G'],
      keywords: [],
      oracleText: ['{T}: Add {G}.'],
    },
  },
  {
    copies: 12,
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    facts: { mv: 2, colors: ['G'], colorIdentity: ['G'], keywords: [] },
  },
  {
    copies: 4,
    id: '78472540-b085-4ee1-848c-de4631274919',
    name: 'Rampant Growth',
    typeLine: 'Sorcery',
    facts: {
      mv: 2,
      colors: ['G'],
      colorIdentity: ['G'],
      keywords: [],
      oracleText: [
        'Search your library for a basic land card, put that card onto ' +
          'the battlefield tapped, then shuffle.',
      ],
    },
  },
  {
    copies: 2,
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
    facts: {
      mv: 1,
      colors: ['U'],
      colorIdentity: ['U'],
      keywords: ['Flying', 'Transform'],
      oracleText: [
        'At the beginning of your upkeep, look at the top card of your ' +
          'library. You may reveal that card. If an instant or sorcery ' +
          'card is revealed this way, transform Delver of Secrets.',
        'Flying',
      ],
    },
  },
  {
    copies: 6,
    id: '8059c52b-5d25-4052-b48a-e9e219a7a546',
    name: 'Colossal Dreadmaw',
    typeLine: 'Creature — Dinosaur',
    power: '6',
    toughness: '6',
    facts: {
      mv: 6,
      colors: ['G'],
      colorIdentity: ['G'],
      keywords: ['Trample'],
      oracleText: ['Trample'],
    },
  },
  {
    copies: 2,
    side: true,
    id: '435589bb-27c6-4a6d-9d63-394d5092b9d8',
    name: 'Lightning Bolt',
    typeLine: 'Instant',
    facts: {
      mv: 1,
      colors: ['R'],
      colorIdentity: ['R'],
      keywords: [],
      oracleText: ['Lightning Bolt deals 3 damage to any target.'],
    },
  },
  {
    copies: 1,
    side: true,
    id: 'a24e8dba-5c86-4e32-8a52-61402f7fe9f0',
    name: 'Containment Priest',
    typeLine: 'Creature — Human Cleric',
    power: '2',
    toughness: '2',
    facts: {
      mv: 2,
      colors: ['W'],
      colorIdentity: ['W'],
      keywords: ['Flash'],
      oracleText: [
        "Flash\nIf a nontoken creature would enter and it wasn't cast, " +
          'exile it instead.',
      ],
    },
  },
];

const facesOf = ({ faces, name, typeLine, power, toughness }: SampleCard) =>
  faces ?? [
    {
      name,
      typeLine,
      ...(power !== undefined && { power }),
      ...(toughness !== undefined && { toughness }),
    },
  ];

const refsOf = (cards: SampleCard[]): CardRef[] =>
  cards.flatMap((card) => {
    const { id, name, typeLine, power, toughness, layout, copies } = card;
    const ref: CardRef = {
      id,
      name,
      typeLine,
      ...(power !== undefined && { power }),
      ...(toughness !== undefined && { toughness }),
      ...(layout !== undefined && { layout }),
      faces: facesOf(card),
    };
    return Array.from({ length: copies }, () => ref);
  });

// A fixed 60-card deck for trying the play test without a card database.
const buildSampleDeck = (): CardRef[] =>
  refsOf(sampleCards.filter((card) => !card.side));

export const buildSampleSideboard = (): CardRef[] =>
  refsOf(sampleCards.filter((card) => card.side));

// Lets library search work on the sample deck without a card database.
export const sampleCardFacts = (id: string): CardFacts | undefined => {
  const card = sampleCards.find((c) => c.id === id);
  if (!card) return undefined;
  const { oracleText = [], ...facts } = card.facts;
  return {
    ...facts,
    faces: facesOf(card).map((face, i) => ({
      ...face,
      ...(oracleText[i] && { oracleText: oracleText[i] }),
    })),
  };
};

export default buildSampleDeck;
