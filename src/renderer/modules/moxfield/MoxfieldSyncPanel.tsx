import type {
  DeckSyncLine,
  DeckSyncOutcome,
  MoxfieldSyncResult,
} from '@shared/moxfield';
import { type FormEvent, useState } from 'react';

import useMoxfieldSync from './useMoxfieldSync';

const secondary =
  'rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-40 bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50';

const outcomeLabels: Record<DeckSyncOutcome, string> = {
  added: 'added',
  updated: 'updated',
  unchanged: 'unchanged',
  gone: 'no longer on Moxfield',
  failed: 'failed',
};

const outcomes = Object.keys(outcomeLabels) as DeckSyncOutcome[];

const when = (iso: string) => new Date(iso).toLocaleString();

// Lines worth reading: anything other than a clean add, update or no-op.
const notable = (line: DeckSyncLine) =>
  line.outcome === 'gone' ||
  line.outcome === 'failed' ||
  line.unresolved.length > 0 ||
  line.notes.length > 0;

const Result = ({ result }: { result: MoxfieldSyncResult }) => (
  <div data-testid="moxfield-result" className="space-y-2 text-sm">
    <p className="text-gray-900">
      {outcomes
        .map((o) => `${result.counts[o]} ${outcomeLabels[o]}`)
        .join(' · ')}
    </p>
    {!result.complete && (
      <p data-testid="moxfield-incomplete" className="text-amber-800">
        The deck list changed on Moxfield while it was being read, so no deck
        was marked as no longer on Moxfield this time. Sync again to check.
      </p>
    )}
    <ul className="space-y-1">
      {result.decks.filter(notable).map((line) => (
        <li key={line.publicId} data-testid="moxfield-result-line">
          <span className="font-medium">{line.name}</span>:{' '}
          {line.outcome === 'failed' && <span>{line.error}</span>}
          {line.outcome === 'gone' && (
            <span>
              no longer public on Moxfield. The deck is kept here; remove it
              from the deck list if you no longer want it.
            </span>
          )}
          {line.unresolved.length > 0 && (
            <span>
              {line.outcome}, without{' '}
              {line.unresolved
                .map((c) => `${c.qty} ${c.name} (${c.reason})`)
                .join(', ')}
              .
            </span>
          )}
          {line.notes.map((note) => (
            <span key={note}> {note}</span>
          ))}
        </li>
      ))}
    </ul>
  </div>
);

// Syncs the public decks of one Moxfield user into the deck list.
const MoxfieldSyncPanel = ({ savedUser }: { savedUser: string }) => {
  const status = useMoxfieldSync();
  const [user, setUser] = useState(savedUser);

  if (!status) return null;
  const { running, progress, error, result, lastSyncedAt } = status;

  const sync = (e: FormEvent) => {
    e.preventDefault();
    window.api.syncMoxfield(user).then(
      (next) => {
        // Main keeps just the username from a pasted profile link.
        if (next.user && !next.error) setUser(next.user);
      },
      (err: unknown) => console.error('[moxfield] could not sync', err)
    );
  };

  return (
    <div className="space-y-3">
      <form className="flex items-end gap-2" onSubmit={sync}>
        <label className="text-sm font-medium text-gray-900">
          Moxfield user
          <input
            aria-label="Moxfield user"
            className="mt-1 block w-80 max-w-full rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
            placeholder="username or moxfield.com/users/… link"
            maxLength={300}
            value={user}
            disabled={running}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        {running ? (
          <button
            type="button"
            className={secondary}
            onClick={() => void window.api.cancelMoxfieldSync()}
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            className={secondary}
            disabled={user.trim() === ''}
          >
            Sync decks
          </button>
        )}
      </form>
      <p
        data-testid="moxfield-status"
        data-running={running}
        className="text-sm text-gray-600"
      >
        {running &&
          (progress && progress.total > 0
            ? `Fetching decks: ${progress.done} of ${progress.total}…`
            : 'Looking for decks…')}
        {!running &&
          (lastSyncedAt
            ? `Last synced ${when(lastSyncedAt)}.`
            : 'Not synced yet.')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error} Your decks were not changed.
        </p>
      )}
      {!running && result && <Result result={result} />}
    </div>
  );
};

export default MoxfieldSyncPanel;
