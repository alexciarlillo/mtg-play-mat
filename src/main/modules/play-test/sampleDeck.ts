import type { CardFace, CardRef } from '@shared/game';

interface SampleCard {
  copies: number;
  id: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  layout?: string;
  // Multi-face cards list every face; others use the card itself.
  faces?: CardFace[];
}

const sampleCards: SampleCard[] = [
  {
    copies: 24,
    id: '3279314f-d639-4489-b2ab-3621bb3ca64b',
    name: 'Forest',
    typeLine: 'Basic Land — Forest',
  },
  {
    copies: 12,
    id: '73542493-cd0b-4bb7-a5b8-8f889c76e4d6',
    name: 'Llanowar Elves',
    typeLine: 'Creature — Elf Druid',
    power: '1',
    toughness: '1',
  },
  {
    copies: 12,
    id: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
  },
  {
    copies: 4,
    id: '78472540-b085-4ee1-848c-de4631274919',
    name: 'Rampant Growth',
    typeLine: 'Sorcery',
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
  },
  {
    copies: 6,
    id: '8059c52b-5d25-4052-b48a-e9e219a7a546',
    name: 'Colossal Dreadmaw',
    typeLine: 'Creature — Dinosaur',
    power: '6',
    toughness: '6',
  },
];

// A fixed 60-card deck for trying the play test without a card database.
const buildSampleDeck = (): CardRef[] =>
  sampleCards.flatMap(({ copies, faces, ...card }) => {
    const { id: _id, layout: _layout, ...face } = card;
    const ref: CardRef = { ...card, faces: faces ?? [face] };
    return Array.from({ length: copies }, () => ref);
  });

export default buildSampleDeck;
