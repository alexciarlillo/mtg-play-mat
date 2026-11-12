import type { CardView } from '@shared/game';

import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { moveMenu } from '../common/cardMenus';
import { adjustCounter } from './battlefieldMenu';

// Opens the counter dialog; with exile set, the card is exiled first.
export type OnZoneCounter = (card: CardView, exile: boolean) => void;

// A graveyard or exile card's menu: the moves, plus counters. Exiled cards
// carry counters (croak, time, foretell); a graveyard card can be exiled
// with one in a single step.
export const zoneCardMenu = (
  card: CardView,
  onCounter?: OnZoneCounter
): ContextMenuSpec[] => {
  if (!onCounter) return moveMenu(card);
  if (card.zone === 'graveyard') {
    return [
      { title: 'Exile with counter…', action: () => onCounter(card, true) },
      ...moveMenu(card),
    ];
  }
  if (card.zone !== 'exile') return moveMenu(card);
  return [
    { title: 'Add counter…', action: () => onCounter(card, false) },
    ...Object.keys(card.counters).flatMap((name) => [
      {
        title: `Add ${name} counter`,
        action: () => adjustCounter(card, name, 1),
      },
      {
        title: `Remove ${name} counter`,
        action: () => adjustCounter(card, name, -1),
      },
    ]),
    ...moveMenu(card),
  ];
};
