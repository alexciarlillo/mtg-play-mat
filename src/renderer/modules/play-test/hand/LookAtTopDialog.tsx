import type { CardView, PlayerId } from '@shared/game';
import { useState } from 'react';

import Card from '../../../ui/Card';
import { Modal } from '../common/Dialogs';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { dispatch } from '../viewStore';
import { useLibrary } from './useLibrary';

type Destination = 'top' | 'bottom' | 'graveyard' | 'hand';

const destinations: { value: Destination; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'hand', label: 'Hand' },
];

interface Arrangement {
  // The looked-at cards this arrangement is for, so a changed library
  // starts a fresh one instead of applying a stale plan.
  key: string;
  order: string[];
  dest: Record<string, Destination>;
}

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

interface Props {
  playerId: PlayerId;
  seq: number;
  count: number;
  onClose(): void;
}

// A private look at the top of the library (scry, surveil, and so on).
// Nothing is applied until Confirm, which is a single action.
const LookAtTopDialog = ({ playerId, seq, count, onClose }: Props) => {
  useLibraryActivity({ kind: 'look', count });
  const library = useLibrary(seq);
  const top = library?.slice(0, count) ?? [];
  const byId = new Map(top.map((card) => [card.instanceId, card]));
  const key = top.map((card) => card.instanceId).join(' ');

  const [saved, setSaved] = useState<Arrangement | null>(null);
  const current: Arrangement =
    saved?.key === key
      ? saved
      : { key, order: top.map((card) => card.instanceId), dest: {} };

  const destOf = (id: string): Destination => current.dest[id] ?? 'top';

  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= current.order.length) return;
    const order = [...current.order];
    [order[index], order[to]] = [order[to], order[index]];
    setSaved({ ...current, order });
  };

  const setDest = (id: string, value: Destination) =>
    setSaved({ ...current, dest: { ...current.dest, [id]: value } });

  const confirm = () => {
    const pick = (value: Destination) =>
      current.order.filter((id) => destOf(id) === value);
    dispatch({
      type: 'arrangeTop',
      playerId,
      top: pick('top'),
      bottom: pick('bottom'),
      graveyard: pick('graveyard'),
      hand: pick('hand'),
    });
    onClose();
  };

  const cards = current.order
    .map((id) => byId.get(id))
    .filter((card): card is CardView => card !== undefined);

  return (
    <Modal title={`Top ${cards.length} of your library`} onClose={onClose} wide>
      {library && cards.length === 0 && (
        <p className="text-sm text-slate-600">Your library is empty.</p>
      )}
      <p className="mb-2 text-xs text-slate-600">
        Left is the top. Cards kept on top or sent to the bottom keep this
        order.
      </p>
      <div data-testid="look-at-top" className="flex gap-3 overflow-x-auto">
        {cards.map((card, i) => (
          <div
            key={card.instanceId}
            data-testid="look-card"
            data-instance-id={card.instanceId}
            data-card-name={card.ref?.name}
            data-dest={destOf(card.instanceId)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <Card card={card} size="sm" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Move left"
                className="rounded px-1 ring-1 ring-slate-400 disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ◀
              </button>
              <select
                aria-label="Destination"
                className="rounded bg-white px-1 text-xs ring-1 ring-slate-400"
                value={destOf(card.instanceId)}
                onChange={(e) =>
                  setDest(card.instanceId, e.target.value as Destination)
                }
              >
                {destinations.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Move right"
                className="rounded px-1 ring-1 ring-slate-400 disabled:opacity-30"
                disabled={i === cards.length - 1}
                onClick={() => move(i, 1)}
              >
                ▶
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`${button} bg-slate-800 text-white`}
          disabled={cards.length === 0}
          onClick={confirm}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
};

export default LookAtTopDialog;
