import type { CardFace, CardRef } from '@shared/game';
import type { CardRow } from '@shared/types/cards';

// The one place a card database row becomes game data, so a schema change
// only has to be absorbed here.
export const toCardRef = (row: CardRow): CardRef => {
  const stats = {
    ...(row.power !== null && { power: row.power }),
    ...(row.toughness !== null && { toughness: row.toughness }),
    ...(row.loyalty !== null && { loyalty: row.loyalty }),
  };
  const face: CardFace = { name: row.name, typeLine: row.type, ...stats };

  return {
    id: row.scryfallId,
    name: row.name,
    typeLine: row.type,
    faces: [face],
    ...stats,
  };
};
