import type { TableEvent } from '@shared/net/protocol';

import { describeEvent, requestRoll } from './pod';

const SHOWN = 4;

const button =
  'flex-1 rounded bg-slate-700 px-1 py-0.5 text-sm font-bold text-white hover:bg-slate-600';

// Dice and coin flips everyone at the table sees. The host rolls, so the
// log reads the same on every board.
const TableLog = ({
  log,
  onCustomDie,
}: {
  log: TableEvent[];
  onCustomDie(): void;
}) => (
  <section data-testid="table-log" className="flex flex-col gap-1">
    <div className="flex gap-1">
      <button
        type="button"
        className={button}
        aria-label="Roll a d6"
        onClick={() => requestRoll({ type: 'die', sides: 6 })}
      >
        d6
      </button>
      <button
        type="button"
        className={button}
        aria-label="Roll a d20"
        onClick={() => requestRoll({ type: 'die', sides: 20 })}
      >
        d20
      </button>
      <button
        type="button"
        className={button}
        aria-label="Flip a coin"
        onClick={() => requestRoll({ type: 'coin' })}
      >
        Coin
      </button>
      <button
        type="button"
        className={button}
        aria-label="Roll another die"
        onClick={onCustomDie}
      >
        dN…
      </button>
    </div>
    <ol className="flex flex-col text-sm" aria-label="Table log">
      {log
        .slice(-SHOWN)
        .reverse()
        .map((event, i) => (
          <li
            key={event.id}
            data-testid="table-event"
            data-by={event.byName}
            data-result={String(event.roll.result)}
            className={
              i === 0 ? 'font-semibold text-amber-200' : 'text-slate-300'
            }
          >
            {describeEvent(event)}
          </li>
        ))}
    </ol>
  </section>
);

export default TableLog;
