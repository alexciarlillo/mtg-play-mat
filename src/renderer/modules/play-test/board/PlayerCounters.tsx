import { playerCounterNames } from '@shared/game';
import classNames from 'classnames';

import { dispatch } from '../viewStore';

const labels: Record<string, string> = {
  poison: 'Poison',
  energy: 'Energy',
  experience: 'Exp',
};

const step =
  'h-4 w-4 rounded bg-slate-800 text-xs font-bold leading-none hover:bg-slate-500';

// Poison, energy, and experience next to the life total. They are public,
// so the opponent's side shows the same numbers read-only.
const PlayerCounters = ({
  counters,
  playerId,
  testId = 'player-counters',
}: {
  counters: Record<string, number>;
  // Without a player id the counters are read-only.
  playerId?: string;
  testId?: string;
}) => {
  const names = [
    ...playerCounterNames,
    ...Object.keys(counters).filter(
      (name) => !(playerCounterNames as readonly string[]).includes(name)
    ),
  ];
  const shown = playerId ? names : names.filter((n) => counters[n]);
  if (shown.length === 0) return null;

  return (
    <div data-testid={testId} className="flex flex-wrap gap-1 text-[11px]">
      {shown.map((name) => {
        const count = counters[name] ?? 0;
        const adjust = (delta: number) =>
          playerId &&
          dispatch({
            type: 'adjustPlayerCounter',
            playerId,
            counter: name,
            delta,
          });
        return (
          <div
            key={name}
            data-counter={name}
            data-count={count}
            className={classNames(
              'flex items-center gap-1 rounded px-1 py-0.5',
              count > 0 ? 'bg-slate-600' : 'bg-slate-700/60'
            )}
          >
            {playerId && (
              <button
                type="button"
                aria-label={`Remove ${name} counter`}
                className={step}
                onClick={() => adjust(-1)}
              >
                −
              </button>
            )}
            <span className="font-medium">{labels[name] ?? name}</span>
            <span className="font-bold tabular-nums">{count}</span>
            {playerId && (
              <button
                type="button"
                aria-label={`Add ${name} counter`}
                className={step}
                onClick={() => adjust(1)}
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PlayerCounters;
