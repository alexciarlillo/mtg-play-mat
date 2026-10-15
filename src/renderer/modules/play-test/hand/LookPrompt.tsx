import { type FormEvent, useState } from 'react';

import { Modal } from '../common/Dialogs';
import { presetById, type PresetId, presets } from './lookLanes';

const buttonClass =
  'rounded px-3 py-1 text-sm font-medium disabled:opacity-40 ring-1 ring-slate-400';

const field = 'rounded px-2 py-1 ring-1 ring-slate-400';

export interface LookChoice {
  preset: PresetId;
  count: number;
  take: number;
}

interface Props {
  initial: LookChoice;
  // Cards left in the library.
  max: number;
  onSubmit(choice: LookChoice): void;
  onClose(): void;
}

const whole = (text: string, min: number, max: number) => {
  const value = Number(text);
  return text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
};

// What kind of look, and at how many cards. The count is focused, so the
// common case stays "type a number, press Enter".
const LookPrompt = ({ initial, max, onSubmit, onClose }: Props) => {
  const [preset, setPreset] = useState(initial.preset);
  const [countText, setCountText] = useState(String(initial.count));
  const [takeText, setTakeText] = useState(String(initial.take));
  const takes = presetById(preset).takes === true;
  const count = whole(countText, 1, Math.max(1, max));
  const take = takes ? whole(takeText, 1, count ?? 1) : initial.take;
  const valid = count !== null && take !== null;

  const choose = (id: PresetId) => {
    setPreset(id);
    const usual = presetById(id).count;
    if (usual !== undefined) setCountText(String(Math.min(usual, max)));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (count === null || take === null) return;
    onSubmit({ preset, count, take });
    onClose();
  };

  return (
    <Modal title="Look at the top of your library" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Effect
          <select
            className={`${field} bg-white`}
            value={preset}
            onChange={(e) => choose(e.target.value as PresetId)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          How many cards?
          <input
            type="number"
            autoFocus
            className={`${field} text-lg`}
            value={countText}
            min={1}
            max={max}
            onChange={(e) => setCountText(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        {takes && (
          <label className="flex flex-col gap-1 text-sm">
            How many into your hand?
            <input
              type="number"
              className={field}
              value={takeText}
              min={1}
              max={count ?? undefined}
              onChange={(e) => setTakeText(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${buttonClass} bg-slate-800 text-white`}
            disabled={!valid}
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default LookPrompt;
