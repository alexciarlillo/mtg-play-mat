import type { CardRef, CardView, RevealSource, RevealView } from '@shared/game';

import Card from '../../../ui/Card';
import type { CardSize } from '../../../ui/cardSizes';

const titles: Record<RevealSource, string> = {
  hand: 'Revealed hand',
  libraryTop: 'Revealed from the top of the library',
  card: 'Revealed from hand',
};

// A revealed card carries only its identity, so give it a throwaway view.
const shownCard = (ref: CardRef, index: number): CardView => ({
  instanceId: `revealed-${index}`,
  ref,
  owner: '',
  controller: '',
  zone: 'hand',
  position: null,
  tapped: false,
  faceDown: false,
  faceIndex: 0,
  counters: {},
  isToken: false,
  attachedTo: null,
});

interface Props {
  reveal: RevealView | null | undefined;
  size?: CardSize;
  // Only the revealing player can put the cards away.
  onHide?(): void;
  testId?: string;
}

// Floats over the top of a battlefield while its player shows hidden
// cards, so everyone watching the board sees them.
const RevealPanel = ({
  reveal,
  size = 'sm',
  onHide,
  testId = 'reveal-panel',
}: Props) => {
  if (!reveal || reveal.cards.length === 0) return null;
  return (
    <div
      data-testid={testId}
      data-source={reveal.source}
      className="absolute left-1/2 top-2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2 rounded-lg bg-slate-900/90 p-2 text-slate-100 shadow-2xl ring-2 ring-amber-300"
    >
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>
          {titles[reveal.source]} ({reveal.cards.length})
        </span>
        {onHide && (
          <button
            type="button"
            className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium hover:bg-slate-600"
            onClick={onHide}
          >
            Hide
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {reveal.cards.map((ref, i) => (
          <Card
            key={i}
            card={shownCard(ref, i)}
            size={size}
            className="shrink-0"
          />
        ))}
      </div>
    </div>
  );
};

export default RevealPanel;
