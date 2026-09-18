import type { CardFace, CardRef } from '@shared/game';
import type { Printing, PrintingFace } from '@shared/types/cards';

type Stats = Pick<CardFace, 'power' | 'toughness' | 'loyalty'>;

const stats = (source: {
  power?: string | null;
  toughness?: string | null;
  loyalty?: string | null;
}): Stats => ({
  ...(source.power != null && { power: source.power }),
  ...(source.toughness != null && { toughness: source.toughness }),
  ...(source.loyalty != null && { loyalty: source.loyalty }),
});

const toFace = (face: PrintingFace): CardFace => ({
  name: face.name,
  typeLine: face.typeLine,
  ...stats(face),
});

// The one place a card database row becomes game data, so a schema change
// only has to be absorbed here.
export const toCardRef = (printing: Printing): CardRef => ({
  id: printing.id,
  name: printing.name,
  typeLine: printing.typeLine ?? printing.faces[0]?.typeLine ?? '',
  faces: printing.faces.map(toFace),
  ...stats(printing),
});
