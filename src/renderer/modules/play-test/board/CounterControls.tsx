import { type CardView, counterNames, currentFace } from '@shared/game';

import { isPlaneswalker, loyalty } from '../../../ui/cardStats';
import { adjustCounter } from './battlefieldMenu';

const button =
  'h-5 w-5 rounded bg-slate-800 text-sm font-bold leading-none text-white hover:bg-slate-600';

interface Row {
  label: string;
  value?: number;
  up: { title: string; counter: string; delta: number };
  down: { title: string; counter: string; delta: number };
}

const isCreature = (card: CardView) =>
  card.faceDown ||
  /Creature/.test(
    (card.ref && currentFace(card.ref, card.faceIndex)?.typeLine) ??
      card.ref?.typeLine ??
      ''
  );

const rowsFor = (card: CardView): Row[] => {
  const rows: Row[] = [];
  const hasPt =
    card.counters[counterNames.plusOne] !== undefined ||
    card.counters[counterNames.minusOne] !== undefined;
  if (isCreature(card) || hasPt) {
    rows.push({
      label: 'P/T',
      up: {
        title: 'Add +1/+1 counter',
        counter: counterNames.plusOne,
        delta: 1,
      },
      down: {
        title: 'Add -1/-1 counter',
        counter: counterNames.minusOne,
        delta: 1,
      },
    });
  }
  if (isPlaneswalker(card)) {
    rows.push({
      label: 'Loyalty',
      value: loyalty(card) ?? 0,
      up: { title: 'Loyalty +1', counter: counterNames.loyalty, delta: 1 },
      down: { title: 'Loyalty -1', counter: counterNames.loyalty, delta: -1 },
    });
  }
  const named = Object.entries(card.counters).filter(
    ([name]) =>
      !Object.values(counterNames).includes(
        name as (typeof counterNames)[keyof typeof counterNames]
      ) ||
      (name === counterNames.loyalty && !isPlaneswalker(card))
  );
  named.forEach(([name, count]) => {
    rows.push({
      label: name,
      value: count,
      up: { title: `Add ${name} counter`, counter: name, delta: 1 },
      down: { title: `Remove ${name} counter`, counter: name, delta: -1 },
    });
  });
  return rows;
};

// Small +/- steppers shown while a permanent is hovered. They sit outside
// the drag handle, so pressing one never starts a drag or taps the card.
const CounterControls = ({ card }: { card: CardView }) => {
  const rows = rowsFor(card);
  if (rows.length === 0) return null;

  return (
    <div
      data-testid="counter-controls"
      className="no-drag absolute -left-1 bottom-8 z-10 hidden flex-col gap-0.5 rounded bg-white/90 p-1 text-xs shadow-lg ring-1 ring-slate-400 group-hover:flex"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {rows.map(({ label, value, up, down }) => (
        <div key={label} className="flex items-center gap-1">
          <button
            type="button"
            aria-label={down.title}
            title={down.title}
            className={button}
            onClick={() => adjustCounter(card, down.counter, down.delta)}
          >
            −
          </button>
          <span className="min-w-12 truncate text-center font-semibold text-slate-800">
            {label}
            {value !== undefined && ` ${value}`}
          </span>
          <button
            type="button"
            aria-label={up.title}
            title={up.title}
            className={button}
            onClick={() => adjustCounter(card, up.counter, up.delta)}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
};

export default CounterControls;
