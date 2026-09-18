export const typeGroups = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
  'Other',
] as const;

export type TypeGroup = (typeof typeGroups)[number];

// Checked in this order, so an artifact creature is a Creature and an
// artifact land a Land.
const precedence: TypeGroup[] = [
  'Creature',
  'Land',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
];

// Multi-face cards group by their front face, as they're cast.
export const typeGroup = (typeLine: string | null | undefined): TypeGroup => {
  const front = (typeLine ?? '').split('//')[0];
  return precedence.find((type) => front.includes(type)) ?? 'Other';
};
