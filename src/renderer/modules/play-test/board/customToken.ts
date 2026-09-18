import type { CardRef } from '@shared/game';

// A token with no printing: just a name, a type line, and optional stats.
export const customTokenRef = ({
  name,
  typeLine,
  power,
  toughness,
}: {
  name: string;
  typeLine: string;
  power: string;
  toughness: string;
}): CardRef => {
  const stats =
    power.trim() !== '' && toughness.trim() !== ''
      ? { power: power.trim(), toughness: toughness.trim() }
      : {};
  const face = { name: name.trim(), typeLine: typeLine.trim(), ...stats };
  return { id: '', custom: true, ...face, faces: [face] };
};
