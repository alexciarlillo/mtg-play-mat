import type { CardView, ZoneId } from '@shared/game';

import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { dispatch } from '../viewStore';

interface Destination {
  title: string;
  to: ZoneId;
  // The library's top is index 0; no index means the bottom.
  index?: number;
}

const destinations: Destination[] = [
  { title: 'Move to hand', to: 'hand' },
  { title: 'Move to battlefield', to: 'battlefield' },
  { title: 'Move to graveyard', to: 'graveyard' },
  { title: 'Move to exile', to: 'exile' },
  { title: 'Move to library top', to: 'library', index: 0 },
  { title: 'Move to library bottom', to: 'library' },
];

export const moveTo = (card: CardView, to: ZoneId, index?: number) =>
  dispatch({
    type: 'moveCard',
    instanceId: card.instanceId,
    to,
    ...(index !== undefined && { index }),
  });

// "Move to…" items for every zone but the card's own, plus a shuffle into
// the library. Titles can be renamed per zone, e.g. graveyard -> Discard.
export const moveMenu = (
  card: CardView,
  titles: Partial<Record<ZoneId, string>> = {}
): ContextMenuSpec[] => [
  ...destinations
    .filter(({ to }) => to !== card.zone)
    .map(({ title, to, index }) => ({
      title: titles[to] ?? title,
      action: () => moveTo(card, to, index),
    })),
  {
    title: 'Shuffle into library',
    action: () =>
      dispatch({ type: 'shuffleIntoLibrary', instanceId: card.instanceId }),
  },
];
