import { XMarkIcon } from '@heroicons/react/20/solid';
import { describeShowingSource } from '@shared/game';

import Card from '../../../ui/Card';
import { shownCard } from '../common/shownCard';
import { dismissShown, useShownToYou } from '../common/targetedReveal';

// Cards other players showed this player alone. Main sends them only to
// the window that shows the hand, never to a shared board, and they stay
// until dismissed, even after the other player stops showing them.
const ShownToYouTray = () => {
  const entries = useShownToYou();
  if (entries.length === 0) return null;
  return (
    <section
      data-testid="shown-to-you"
      aria-label="Shown to you"
      className="sticky right-0 ml-auto flex shrink-0 flex-col gap-1 border-l border-slate-600 bg-slate-800 pl-3"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-violet-200">
        Shown to you
        {entries.length > 1 && (
          <button
            type="button"
            className="rounded px-1 font-medium normal-case text-slate-300 hover:bg-slate-600"
            onClick={() => dismissShown(null)}
          >
            Dismiss all
          </button>
        )}
      </div>
      <div className="flex gap-3">
        {entries.map((entry) => (
          <div
            key={entry.key}
            data-testid="shown-to-you-entry"
            data-from={entry.fromName}
            data-ended={entry.ended || undefined}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
              <span className="max-w-56 truncate">
                {entry.fromName}:{' '}
                {describeShowingSource(entry.source, entry.cards.length)}
                {entry.ended && ' (no longer shown)'}
              </span>
              <button
                type="button"
                aria-label={`Dismiss the cards ${entry.fromName} showed you`}
                className="rounded p-0.5 text-slate-300 hover:bg-slate-600"
                onClick={() => dismissShown(entry.key)}
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
            <div className="flex gap-2">
              {entry.cards.map((ref, i) => (
                <Card
                  key={i}
                  card={shownCard(ref, `${entry.key}-${i}`)}
                  size="sm"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ShownToYouTray;
