import {
  type CardView,
  isHiddenSearchPick,
  type PlayerId,
  type SearchLibraryAction,
  type SearchPick,
} from '@shared/game';
import { useState } from 'react';

import CardBrowser from '../common/CardBrowser';
import { moveTo } from '../common/cardMenus';
import { Modal } from '../common/Dialogs';
import RevealTargetSelect from '../common/RevealTargetSelect';
import {
  EVERYONE,
  revealTo,
  useRevealChoice,
  useRevealTargets,
} from '../common/targetedReveal';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { dispatch } from '../viewStore';
import { useLibrary } from './useLibrary';

// Entering tapped is a choice of destination here, not a separate toggle.
type Destination = SearchPick['to'] | 'battlefieldTapped';

const destinations: { value: Destination; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'battlefield', label: 'Battlefield' },
  { value: 'battlefieldTapped', label: 'Battlefield tapped' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'exile', label: 'Exile' },
  { value: 'top', label: 'Top of library' },
  { value: 'bottom', label: 'Bottom of library' },
];

const toPick = (instanceId: string, to: Destination): SearchPick =>
  to === 'battlefieldTapped'
    ? { instanceId, to: 'battlefield', tapped: true }
    : { instanceId, to };

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';
const select = 'rounded bg-white px-1 py-0.5 ring-1 ring-slate-400';

const DestinationSelect = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Destination;
  onChange(value: Destination): void;
}) => (
  <select
    aria-label={label}
    className={select}
    value={value}
    onChange={(e) => onChange(e.target.value as Destination)}
  >
    {destinations.map(({ value, label }) => (
      <option key={value} value={value}>
        {label}
      </option>
    ))}
  </select>
);

const nameOf = (card: CardView | undefined) => card?.ref?.name ?? 'a card';

interface Props {
  playerId: PlayerId;
  seq: number;
  onClose(): void;
}

const SearchLibraryDialog = ({ playerId, seq, onClose }: Props) => {
  useLibraryActivity({ kind: 'search' });
  const library = useLibrary(seq);
  const [picked, setPicked] = useState<string[]>([]);
  const [allTo, setAllTo] = useState<Destination>('hand');
  // Per-pick choices that differ from the "all" destination.
  const [own, setOwn] = useState<Record<string, Destination>>({});
  const [shuffle, setShuffle] = useState(true);
  const [reveal, setReveal] = useState(false);
  const targets = useRevealTargets();
  const revealFor = useRevealChoice(targets);

  const [prunedFor, setPrunedFor] = useState(library);

  const byId = new Map(library?.map((card) => [card.instanceId, card]));
  const chosen = picked.filter((id) => byId.has(id));
  const destinationOf = (id: string) => own[id] ?? allTo;

  // A card picked again starts from the "all" destination.
  const changePicked = (next: string[]) => {
    setPicked(next);
    setOwn((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => next.includes(id))
      )
    );
  };

  // Forget picks that left the library, so a card that comes back
  // isn't quietly picked again with an old destination.
  if (library && library !== prunedFor) {
    setPrunedFor(library);
    if (chosen.length !== picked.length) changePicked(chosen);
  }

  const setAll = (to: Destination) => {
    setAllTo(to);
    setOwn({});
  };

  const picks = chosen.map((id) => toPick(id, destinationOf(id)));
  // Picks onto the battlefield, graveyard or exile are seen anyway.
  const hidden = picks.filter(isHiddenSearchPick).map((p) => p.instanceId);
  const showing = reveal && hidden.length > 0;
  // Never fall back to everyone: the player has to choose again.
  const blocked = showing && !revealFor.ready;

  const confirm = () => {
    if (blocked) return;
    const action: SearchLibraryAction = {
      type: 'searchLibrary',
      playerId,
      picks,
      shuffle,
      ...(showing && revealFor.value === EVERYONE && { reveal: true }),
    };
    // Main reads them while still in the library and shows them once the
    // search has moved them, as one step.
    if (showing && revealFor.value !== EVERYONE) {
      revealTo(
        { to: revealFor.value, source: 'search', instanceIds: hidden },
        action
      );
    } else {
      dispatch(action);
    }
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
        onPickedChange={changePicked}
        menu={(card) => [
          {
            title: 'Move to sideboard',
            action: () => moveTo(card, 'sideboard'),
          },
        ]}
      />
      <div
        data-testid="search-footer"
        className="mt-2 flex flex-col gap-1 border-t border-slate-300 pt-2 text-sm"
      >
        {chosen.length > 0 && (
          <ol
            aria-label="Picked cards"
            className="flex max-h-16 flex-wrap gap-1 overflow-auto"
          >
            {chosen.map((id, i) => {
              const name = nameOf(byId.get(id));
              return (
                <li
                  key={id}
                  data-testid="search-pick"
                  data-instance-id={id}
                  className="flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5"
                >
                  <span className="max-w-40 truncate">
                    {i + 1}. {name}
                  </span>
                  <DestinationSelect
                    label={`Destination for ${i + 1}. ${name}`}
                    value={destinationOf(id)}
                    onChange={(to) => setOwn({ ...own, [id]: to })}
                  />
                  <button
                    type="button"
                    aria-label={`Unpick ${i + 1}. ${name}`}
                    className="px-1 text-slate-600 hover:text-slate-900"
                    onClick={() =>
                      changePicked(chosen.filter((other) => other !== id))
                    }
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            {chosen.length > 1 ? 'All to' : 'To'}
            <DestinationSelect
              label="Destination"
              value={allTo}
              onChange={setAll}
            />
            {chosen.length > 1 && (
              <span className="text-xs text-slate-500">(resets each pick)</span>
            )}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
            />
            Shuffle afterwards
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={reveal}
              disabled={chosen.length === 0}
              onChange={(e) => setReveal(e.target.checked)}
            />
            Reveal picked cards
          </label>
          {reveal && (targets.length > 0 || revealFor.value !== EVERYONE) && (
            <label className="flex items-center gap-1">
              to
              <RevealTargetSelect
                label="Reveal picked cards to"
                targets={targets}
                choice={revealFor}
                disabled={chosen.length === 0}
                className={select}
              />
            </label>
          )}
          <button
            type="button"
            className={`${button} ml-auto bg-slate-800 text-white`}
            disabled={blocked}
            onClick={chosen.length > 0 || shuffle ? confirm : onClose}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SearchLibraryDialog;
