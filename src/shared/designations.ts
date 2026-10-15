import type { CardFace } from './game';

export interface Designation {
  key: string;
  label: string;
  // Scryfall's name for the printing that stands for it.
  name: string;
  // The face to put into play, when it isn't the front.
  faceIndex?: number;
  // Used when the card database doesn't have it.
  faces: CardFace[];
}

// Game-wide states as the cards Scryfall prints for them. Day // Night is
// one double-faced card, transformed when day and night change.
export const designations: Designation[] = [
  {
    key: 'monarch',
    label: 'Monarch',
    name: 'The Monarch',
    faces: [{ name: 'The Monarch', typeLine: 'Card' }],
  },
  {
    key: 'initiative',
    label: 'Initiative',
    name: 'Undercity // The Initiative',
    faceIndex: 1,
    faces: [
      { name: 'Undercity', typeLine: 'Dungeon — Undercity' },
      { name: 'The Initiative', typeLine: 'Card' },
    ],
  },
  {
    key: 'ring',
    label: 'The Ring',
    name: 'The Ring // The Ring Tempts You',
    faces: [
      { name: 'The Ring', typeLine: 'Emblem' },
      { name: 'The Ring Tempts You', typeLine: 'Card' },
    ],
  },
  {
    key: 'citys-blessing',
    label: 'City’s Blessing',
    name: "City's Blessing",
    faces: [{ name: "City's Blessing", typeLine: 'Card' }],
  },
  {
    key: 'day-night',
    label: 'Day/Night',
    name: 'Day // Night',
    faces: [
      { name: 'Day', typeLine: 'Card' },
      { name: 'Night', typeLine: 'Card' },
    ],
  },
];

// The face a designation's card is put into play on, for a related part
// made by a card (the Initiative shows its back).
export const designationFace = (name: string): number | undefined =>
  designations.find((designation) => designation.name === name)?.faceIndex;

// Scryfall lists designations as combo pieces typed just "Card", like
// many things a card doesn't make (Energy Reserve, set checklists).
export const isDesignationName = (name: string): boolean =>
  designations.some((designation) => designation.name === name);
