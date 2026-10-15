import type { CardView, PlayerId, ZoneId } from '@shared/game';
import { useState } from 'react';

import CardBrowser from '../common/CardBrowser';
import { moveMenu } from '../common/cardMenus';
import { Modal } from '../common/Dialogs';
import { dispatch } from '../viewStore';

type Destination =
  | 'hand'
  | 'battlefield'
  | 'battlefieldTapped'
  | 'graveyard'
  | 'exile'
  | 'top'
  | 'bottom';

const destinations: { value: Destination; label: string }[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'battlefield', label: 'Battlefield' },
  { value: 'battlefieldTapped', label: 'Battlefield tapped' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'exile', label: 'Exile' },
  { value: 'top', label: 'Top of library' },
  { value: 'bottom', label: 'Bottom of library' },
];

const placements: Record<
  Destination,
  { to: ZoneId; index?: number; tapped?: boolean }
> = {
  hand: { to: 'hand' },
  battlefield: { to: 'battlefield' },
  battlefieldTapped: { to: 'battlefield', tapped: true },
  graveyard: { to: 'graveyard' },
  exile: { to: 'exile' },
  top: { to: 'library', index: 0 },
  bottom: { to: 'library' },
};

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

interface Props {
  playerId: PlayerId;
  cards: CardView[];
  onClose(): void;
}

// Wishes, Lessons and the like: the owner's private look at their
// sideboard. Picked cards move together as one step.
const SideboardDialog = ({ playerId, cards, onClose }: Props) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState<Destination>('hand');
  const here = new Set(cards.map((card) => card.instanceId));
  const chosen = picked.filter((id) => here.has(id));

  const move = () => {
    dispatch({
      type: 'moveCards',
      playerId,
      instanceIds: chosen,
      ...placements[to],
    });
    setPicked([]);
    onClose();
  };

  return (
    <Modal title={`Sideboard (${cards.length})`} onClose={onClose} wide column>
      <CardBrowser
        zone="sideboard"
        cards={cards}
        label="Search the sideboard"
        testId="sideboard-browser"
        tileTestId="sideboard-card"
        picked={chosen}
        onPickedChange={setPicked}
        menu={moveMenu}
      />
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-300 pt-2 text-sm">
        <label className="flex items-center gap-1">
          To
          <select
            aria-label="Destination"
            className="rounded bg-white px-1 py-0.5 ring-1 ring-slate-400"
            value={to}
            onChange={(e) => setTo(e.target.value as Destination)}
          >
            {destinations.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-600">
          Click cards to pick them, or right-click one to move it.
        </span>
        <button
          type="button"
          className={`${button} ml-auto bg-slate-800 text-white`}
          disabled={chosen.length === 0}
          onClick={move}
        >
          Move {chosen.length}
        </button>
      </div>
    </Modal>
  );
};

export default SideboardDialog;
