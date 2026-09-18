import { frontFaceName } from '../cardNames';
import type { DeckBoard, DeckCard } from '../types/decks';

export type ExportFormat = 'mtga' | 'moxfield';

// Arena names these layouts by their front face only.
const frontOnlyLayouts = new Set([
  'transform',
  'modal_dfc',
  'adventure',
  'flip',
  'meld',
]);

const sections: { board: DeckBoard; title: string }[] = [
  { board: 'commander', title: 'Commander' },
  { board: 'main', title: 'Deck' },
  { board: 'side', title: 'Sideboard' },
];

const cardLine = (card: DeckCard, format: ExportFormat): string | null => {
  const { printing } = card;
  if (!printing) return null;
  const name =
    format === 'mtga' && frontOnlyLayouts.has(printing.layout)
      ? frontFaceName(printing.name)
      : printing.name;
  const set = printing.setCode.toUpperCase();
  return `${card.qty} ${name} (${set}) ${printing.collectorNumber}`;
};

// Both formats use MTGA-style section headers, which Moxfield also reads;
// they differ in how multi-face cards are named.
export const exportDeck = (cards: DeckCard[], format: ExportFormat): string =>
  sections
    .map(({ board, title }) => {
      const lines = cards
        .filter((card) => card.board === board)
        .map((card) => cardLine(card, format))
        .filter((line) => line !== null);
      return lines.length ? [title, ...lines].join('\n') : null;
    })
    .filter((block) => block !== null)
    .join('\n\n')
    .concat('\n');
