import type { LibraryActivity } from '@shared/game';
import classNames from 'classnames';

// Silver for looking at the top of a library (a scry), gold for a
// search. Two activities that mean very different things to the table
// should not look alike from across it.
type Tone = 'silver' | 'gold';

const tones: Record<Tone, { ring: string; chip: string }> = {
  silver: {
    ring: 'ring-slate-100',
    chip: 'bg-slate-100 text-slate-900',
  },
  gold: {
    ring: 'ring-amber-300',
    chip: 'bg-amber-300 text-slate-900',
  },
};

const styles = (activity: LibraryActivity) => {
  switch (activity.kind) {
    case 'look':
      return {
        tone: 'silver' as Tone,
        long: `Looking at top ${activity.count}…`,
        short: `Top ${activity.count}…`,
      };
    case 'search':
      return {
        tone: 'gold' as Tone,
        long: 'Searching library…',
        short: 'Searching…',
      };
    default:
      return {
        tone: 'gold' as Tone,
        long: 'In their library…',
        short: 'In library…',
      };
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
  const { tone, long, short } = styles(activity);
  return (
    <div
      data-testid={testId}
      data-kind={activity.kind}
      data-tone={tone}
      title={long}
      className={classNames(
        'pointer-events-none absolute inset-0 flex items-end justify-center rounded-lg ring-4 ring-inset',
        tones[tone].ring
      )}
    >
      <span
        className={classNames(
          'mb-1 max-w-full animate-pulse rounded text-center font-semibold leading-tight shadow',
          tones[tone].chip,
          compact ? 'px-0.5 text-[10px]' : 'px-1 text-xs'
        )}
      >
        {compact ? short : long}
      </span>
    </div>
  );
};

export default LibraryActivityBadge;
