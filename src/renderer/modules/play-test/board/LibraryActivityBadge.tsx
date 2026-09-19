import type { LibraryActivity } from '@shared/game';
import classNames from 'classnames';

const labels = (activity: LibraryActivity) => {
  switch (activity.kind) {
    case 'look':
      return {
        long: `Looking at top ${activity.count}…`,
        short: `Top ${activity.count}…`,
      };
    case 'search':
      return { long: 'Searching library…', short: 'Searching…' };
    default:
      return { long: 'In their library…', short: 'In library…' };
  }
};

// Laid over a library pile (which must be relative) while its owner has
// a library dialog open. Compact is for the small piles of a pod.
const LibraryActivityBadge = ({
  activity,
  compact = false,
  testId,
}: {
  activity: LibraryActivity | null | undefined;
  compact?: boolean;
  testId: string;
}) => {
  if (!activity) return null;
  const { long, short } = labels(activity);
  return (
    <div
      data-testid={testId}
      data-kind={activity.kind}
      title={long}
      className="pointer-events-none absolute inset-0 flex items-end justify-center rounded-lg ring-4 ring-inset ring-amber-300"
    >
      <span
        className={classNames(
          'mb-1 max-w-full animate-pulse rounded bg-amber-300 text-center font-semibold leading-tight text-slate-900 shadow',
          compact ? 'px-0.5 text-[10px]' : 'px-1 text-xs'
        )}
      >
        {compact ? short : long}
      </span>
    </div>
  );
};

export default LibraryActivityBadge;
