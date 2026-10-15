import {
  type CardTypeFilter,
  type CardView,
  matchesTypes,
  type PlayerId,
  type ZoneId,
} from '@shared/game';

import { Modal } from '../common/Dialogs';
import { dispatch } from '../viewStore';

interface Group {
  label: string;
  filter?: CardTypeFilter;
}

const bulkGroups: Group[] = [
  { label: 'All permanents' },
  { label: 'Nonland permanents', filter: { excludeTypes: ['Land'] } },
  { label: 'Creatures', filter: { types: ['Creature'] } },
  {
    label: 'Artifacts and enchantments',
    filter: { types: ['Artifact', 'Enchantment'] },
  },
  { label: 'Lands', filter: { types: ['Land'] } },
];

const destinations: { zone: ZoneId; label: string }[] = [
  { zone: 'hand', label: 'Hand' },
  { zone: 'graveyard', label: 'Graveyard' },
  { zone: 'exile', label: 'Exile' },
];

const buttonClass =
  'rounded px-2 py-1 text-sm font-medium ring-1 ring-slate-400 hover:bg-stone-300 disabled:opacity-40 disabled:hover:bg-transparent';

interface Props {
  playerId: PlayerId;
  battlefield: CardView[];
  onClose(): void;
}

// Board wipes and mass bounces: each button is one action, one log line
// and one undo, whatever it moves.
const BulkMoveDialog = ({ playerId, battlefield, onClose }: Props) => {
  const move = (group: Group, to: ZoneId) => {
    dispatch({
      type: 'moveAll',
      playerId,
      from: 'battlefield',
      to,
      ...(group.filter && { filter: group.filter }),
    });
    onClose();
  };

  return (
    <Modal title="Move permanents" onClose={onClose} medium>
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className="sr-only">Permanents</th>
            {destinations.map(({ zone, label }) => (
              <th key={zone} className="sr-only">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bulkGroups.map((group) => {
            const count = battlefield.filter((card) =>
              matchesTypes(card, group.filter)
            ).length;
            return (
              <tr key={group.label}>
                <th scope="row" className="pr-2 text-left font-medium">
                  {group.label}{' '}
                  <span className="tabular-nums text-slate-500">({count})</span>
                </th>
                {destinations.map(({ zone, label }) => (
                  <td key={zone} className="px-1 text-center">
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`${group.label} to ${label.toLowerCase()}`}
                      disabled={count === 0}
                      onClick={() => move(group, zone)}
                    >
                      {label}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

export default BulkMoveDialog;
