import type { KnownCard, KnownCards } from '@shared/game';

import { CardPill } from '../common/SeenEntries';

// More than this many at one end is shown as a count.
const MAX_PILLS = 6;

const Pills = ({
  cards,
  end,
}: {
  cards: KnownCard[];
  end: 'top' | 'bottom';
}) => {
  // The bottom keeps its lowest cards, the top its highest.
  const shown =
    end === 'top' ? cards.slice(0, MAX_PILLS) : cards.slice(-MAX_PILLS);
  const more = cards.length - shown.length;
  return (
    <span data-testid={`known-${end}`} className="flex items-center gap-1">
      {end === 'bottom' && more > 0 && <span>+{more} …</span>}
      {shown.map((card) => (
        <CardPill
          key={card.instanceId}
          card={card.ref}
          previewKey={`known-${card.instanceId}`}
          muted={card.random}
        />
      ))}
      {end === 'top' && more > 0 && <span>… +{more}</span>}
    </span>
  );
};

// What the player knows of either end of their own library: cards they
// looked at, put back, or tutored there. Main only ever sends it where
// the hand is shown.
const KnownStrip = ({ known }: { known?: KnownCards }) => {
  const top = known?.top ?? [];
  const bottom = known?.bottom ?? [];
  if (top.length === 0 && bottom.length === 0) return null;
  return (
    <div
      data-testid="known-cards"
      className="flex h-6 w-full shrink-0 items-center gap-1.5 overflow-x-auto bg-slate-700 px-2 text-xs whitespace-nowrap text-slate-200"
    >
      {top.length > 0 && (
        <>
          <span className="font-semibold">Known top:</span>
          <Pills cards={top} end="top" />
        </>
      )}
      {top.length > 0 && bottom.length > 0 && <span>·</span>}
      {bottom.length > 0 && (
        <>
          <span className="font-semibold">
            {top.length > 0 ? 'bottom' : 'Known bottom'} (lowest last):
          </span>
          <Pills cards={bottom} end="bottom" />
        </>
      )}
    </div>
  );
};

export default KnownStrip;
