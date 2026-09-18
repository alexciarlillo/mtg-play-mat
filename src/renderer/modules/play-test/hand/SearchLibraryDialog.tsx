import type { CardView, PlayerId, SearchDestination } from '@shared/game';
import classNames from 'classnames';
import { useState } from 'react';

import Card from '../../../ui/Card';
import { Modal } from '../common/Dialogs';
import { dispatch } from '../viewStore';
import { useLibrary } from './useLibrary';

const destinations: { value: SearchDestination; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'battlefield', label: 'Battlefield' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'exile', label: 'Exile' },
  { value: 'library', label: 'Top of library' },
];

const matches = (card: CardView, query: string) => {
  const ref = card.ref;
  if (!ref || query === '') return true;
  const text = [ref.name, ref.typeLine, ...ref.faces.map((f) => f.name)]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
};

// Sorted by name so the search itself shows nothing of the library order.
const byName = (a: CardView, b: CardView) =>
  (a.ref?.name ?? '').localeCompare(b.ref?.name ?? '');

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

interface Props {
  playerId: PlayerId;
  seq: number;
  onClose(): void;
}

const SearchLibraryDialog = ({ playerId, seq, onClose }: Props) => {
  const library = useLibrary(seq);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState<SearchDestination>('hand');
  const [shuffle, setShuffle] = useState(true);

  const inLibrary = new Set(library?.map((card) => card.instanceId));
  const chosen = picked.filter((id) => inLibrary.has(id));
  const shown = (library ?? [])
    .filter((card) => matches(card, query.trim()))
    .sort(byName);

  const toggle = (card: CardView) =>
    setPicked((current) =>
      current.includes(card.instanceId)
        ? current.filter((id) => id !== card.instanceId)
        : [...current, card.instanceId]
    );

  const confirm = () => {
    dispatch({
      type: 'searchLibrary',
      playerId,
      instanceIds: chosen,
      to,
      shuffle,
    });
    onClose();
  };

  let confirmLabel = 'Close';
  if (chosen.length > 0) {
    confirmLabel = `Move ${chosen.length}${shuffle ? ' and shuffle' : ''}`;
  } else if (shuffle) {
    confirmLabel = 'Shuffle';
  }

  return (
    <Modal title="Search your library" onClose={onClose} wide>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          autoFocus
          aria-label="Filter by name or type"
          placeholder="Filter by name or type"
          className="min-w-40 flex-1 rounded px-2 py-1 ring-1 ring-slate-400"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-1">
          To
          <select
            aria-label="Destination"
            className="rounded bg-white px-1 py-1 ring-1 ring-slate-400"
            value={to}
            onChange={(e) => setTo(e.target.value as SearchDestination)}
          >
            {destinations.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
          />
          Shuffle afterwards
        </label>
        <button
          type="button"
          className={`${button} bg-slate-800 text-white`}
          onClick={chosen.length > 0 || shuffle ? confirm : onClose}
        >
          {confirmLabel}
        </button>
      </div>
      <div
        data-testid="library-search"
        className="flex flex-wrap gap-2 text-center"
      >
        {shown.map((card) => (
          <div
            key={card.instanceId}
            data-testid="search-card"
            data-picked={chosen.includes(card.instanceId) || undefined}
            className={classNames('rounded-lg', {
              'outline-4 outline-sky-500': chosen.includes(card.instanceId),
            })}
          >
            <Card card={card} size="sm" onClick={toggle} />
          </div>
        ))}
        {library && shown.length === 0 && (
          <p className="text-sm text-slate-600">No matching cards.</p>
        )}
      </div>
    </Modal>
  );
};

export default SearchLibraryDialog;
