import type { PlayerId, SearchDestination } from '@shared/game';
import { useState } from 'react';

import CardBrowser from '../common/CardBrowser';
import { Modal } from '../common/Dialogs';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { dispatch } from '../viewStore';
import { useLibrary } from './useLibrary';

const destinations: { value: SearchDestination; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'battlefield', label: 'Battlefield' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'exile', label: 'Exile' },
  { value: 'library', label: 'Top of library' },
];

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

interface Props {
  playerId: PlayerId;
  seq: number;
  onClose(): void;
}

const SearchLibraryDialog = ({ playerId, seq, onClose }: Props) => {
  useLibraryActivity({ kind: 'search' });
  const library = useLibrary(seq);
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState<SearchDestination>('hand');
  const [shuffle, setShuffle] = useState(true);

  const inLibrary = new Set(library?.map((card) => card.instanceId));
  const chosen = picked.filter((id) => inLibrary.has(id));

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
    <Modal title="Search your library" onClose={onClose} wide column>
      <CardBrowser
        zone="library"
        cards={library}
        label="Search the library"
        testId="library-search"
        tileTestId="search-card"
        picked={chosen}
        onPickedChange={setPicked}
        actions={
          <span className="ml-auto flex flex-wrap items-center gap-2">
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
          </span>
        }
      />
    </Modal>
  );
};

export default SearchLibraryDialog;
