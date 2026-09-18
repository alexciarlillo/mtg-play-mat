import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { CardDataStatus } from '@shared/types/cardData';

import useCardDataStatus from './useCardDataStatus';

const MB = 1024 * 1024;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const describe = (status: CardDataStatus): string => {
  const { phase, local, progress } = status;

  if (phase === 'checking') return 'Checking for card data…';
  if (phase === 'updating' && progress) {
    const total = progress.totalBytes
      ? ` / ${(progress.totalBytes / MB).toFixed(0)} MB`
      : ' MB';
    return `Downloading card data: ${(progress.bytes / MB).toFixed(0)}${total}, ${progress.rows.toLocaleString()} cards`;
  }
  if (!local) return 'No card data yet';
  return `Card data from ${formatDate(local.sourceUpdatedAt)} (${local.printings.toLocaleString()} cards)`;
};

// Shows when card data was last updated, progress while an update runs,
// and a button to update now.
const CardDataPanel = () => {
  const status = useCardDataStatus();
  if (!status) return null;

  const busy = status.phase === 'checking' || status.phase === 'updating';
  const { progress } = status;
  const percent =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, (progress.bytes / progress.totalBytes) * 100)
      : null;

  return (
    <div
      className="flex items-center gap-3 text-sm text-gray-300"
      data-testid="card-data-status"
      data-phase={status.phase}
    >
      <div className="flex flex-col items-end">
        <span role="status" aria-live="polite">
          {describe(status)}
        </span>
        {status.phase === 'updating' && (
          <div
            className="mt-1 h-1.5 w-56 overflow-hidden rounded-full bg-gray-700"
            role="progressbar"
            aria-label="Card data download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent === null ? undefined : Math.round(percent)}
          >
            <div
              className="h-full bg-indigo-400 transition-[width]"
              style={{ width: `${percent ?? 100}%` }}
            />
          </div>
        )}
        {status.error && (
          <span className="text-red-300" title={status.error}>
            Update failed: {status.error}
          </span>
        )}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md bg-gray-700 px-3 py-1.5 font-medium text-white hover:bg-gray-600 disabled:opacity-50"
        disabled={busy}
        onClick={() => void window.api.updateCardData()}
      >
        <ArrowPathIcon
          className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          aria-hidden="true"
        />
        Update card data
      </button>
    </div>
  );
};

export default CardDataPanel;
