import classNames from 'classnames';

import type { CardSize } from '../../../ui/cardSizes';

// Two digits stay circular and a third widens the pill rather than
// spilling, since a hundred-card library is ordinary.
const badgeSizes: Record<CardSize, string> = {
  xs: 'bottom-1 right-1 h-5 min-w-5 px-1 text-[11px]',
  sm: 'bottom-1 right-1 h-7 min-w-7 px-1.5 text-sm',
  md: 'bottom-1 right-1 h-8 min-w-8 px-2 text-base',
  lg: 'bottom-1.5 right-1.5 h-9 min-w-9 px-2 text-lg',
};

// A zone's card count, laid over its pile (which must be relative). The
// dark wash keeps the number readable over art and over an empty
// placeholder alike, while still showing the card under it.
const ZoneCountBadge = ({
  count,
  size = 'sm',
}: {
  count: number;
  size?: CardSize;
}) => (
  <div
    aria-hidden
    className={classNames(
      'pointer-events-none absolute flex items-center justify-center rounded-full',
      'bg-slate-900/75 font-bold leading-none tabular-nums text-slate-50',
      'shadow ring-1 ring-slate-100/30',
      badgeSizes[size]
    )}
  >
    {count}
  </div>
);

export default ZoneCountBadge;
