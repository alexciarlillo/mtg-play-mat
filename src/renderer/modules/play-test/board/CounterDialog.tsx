import type { CardView } from '@shared/game';
import { type FormEvent, useState } from 'react';

import { Modal } from '../common/Dialogs';
import { adjustCounter } from './battlefieldMenu';

const suggestions = [
  '+1/+1',
  '-1/-1',
  'loyalty',
  'charge',
  'time',
  'shield',
  'stun',
  'oil',
  'lore',
  'finality',
];

const input = 'rounded px-2 py-1 ring-1 ring-slate-400';
const button =
  'rounded px-3 py-1 text-sm font-medium disabled:opacity-40 ring-1 ring-slate-400';

// Adds (or removes, with a negative amount) any named counter.
const CounterDialog = ({
  card,
  onClose,
}: {
  card: CardView;
  onClose(): void;
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('1');
  const n = Number(amount);
  const valid =
    name.trim().length > 0 &&
    name.trim().length <= 40 &&
    Number.isInteger(n) &&
    n !== 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    adjustCounter(card, name.trim(), n);
    onClose();
  };

  return (
    <Modal title="Add counter" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Counter
          <input
            autoFocus
            list="counter-names"
            className={input}
            value={name}
            maxLength={40}
            placeholder="e.g. charge"
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="counter-names">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          Amount (negative removes)
          <input
            type="number"
            className={input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${button} bg-slate-800 text-white`}
            disabled={!valid}
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CounterDialog;
