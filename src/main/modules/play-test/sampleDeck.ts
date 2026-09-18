import CardModel, { CardModelProps } from '@shared/models/CardModel';

type SampleCard = Omit<CardModelProps, 'id' | 'key'> & { copies: number };

const sampleCards: SampleCard[] = [
  {
    copies: 8,
    name: 'Forest',
    scryfallId: '3279314f-d639-4489-b2ab-3621bb3ca64b',
    setCode: 'M21',
    number: '272',
    type: 'Basic Land — Forest',
  },
  {
    copies: 4,
    name: 'Llanowar Elves',
    scryfallId: '73542493-cd0b-4bb7-a5b8-8f889c76e4d6',
    setCode: 'M19',
    number: '314',
    type: 'Creature — Elf Druid',
    power: '1',
    toughness: '1',
  },
  {
    copies: 4,
    name: 'Grizzly Bears',
    scryfallId: '409f9b88-f03e-40b6-9883-68c14c37c0de',
    setCode: '10E',
    number: '268',
    type: 'Creature — Bear',
    power: '2',
    toughness: '2',
  },
  {
    copies: 2,
    name: 'Rampant Growth',
    scryfallId: '78472540-b085-4ee1-848c-de4631274919',
    setCode: 'M10',
    number: '201',
    type: 'Sorcery',
  },
  {
    copies: 2,
    name: 'Colossal Dreadmaw',
    scryfallId: '8059c52b-5d25-4052-b48a-e9e219a7a546',
    setCode: 'M21',
    number: '176',
    type: 'Creature — Dinosaur',
    power: '6',
    toughness: '6',
    keywords: ['trample'],
  },
];

// Each copy gets its own id because the play test stores look cards up by
// id, and duplicates sharing one would move or destroy the wrong copy.
const buildSampleDeck = (): CardModel[] =>
  sampleCards
    .flatMap(({ copies, ...card }) =>
      Array.from({ length: copies }, (_, copy) => ({ card, copy }))
    )
    .map(
      ({ card, copy }, index) =>
        new CardModel({ ...card, id: `sample-${index}-${copy}`, key: index })
    );

export default buildSampleDeck;
