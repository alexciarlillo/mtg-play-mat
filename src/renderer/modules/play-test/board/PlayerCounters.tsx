import {
  isManaCounter,
  type ManaColor,
  manaColors,
  manaCounter,
  playerCounterNames,
} from '@shared/game';
import classNames from 'classnames';

import { dispatch } from '../viewStore';

const labels: Record<string, string> = {
  poison: 'Poison',
  energy: 'Energy',
  experience: 'Exp',
};

const manaStyles: Record<ManaColor, string> = {
  W: 'bg-amber-50 text-slate-900',
  U: 'bg-sky-500 text-white',
  B: 'bg-zinc-900 text-white ring-1 ring-zinc-500',
  R: 'bg-red-600 text-white',
  G: 'bg-green-600 text-white',
  C: 'bg-stone-400 text-slate-900',
};

const manaNames: Record<ManaColor, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
  C: 'colorless',
};

// The mana pool as one pip per colour: click adds one, right-click takes
// one away. Read-only, only the colours with mana are shown.
const ManaPool = ({
  counters,
  playerId,
}: {
  counters: Record<string, number>;
  playerId?: string;
}) => {
  const shown = playerId
    ? manaColors
    : manaColors.filter((color) => counters[manaCounter(color)]);
  if (shown.length === 0) return null;
  const empty = !manaColors.some((color) => counters[manaCounter(color)]);
  const adjust = (color: ManaColor, delta: number) =>
    playerId &&
    dispatch({
      type: 'adjustPlayerCounter',
      playerId,
      counter: manaCounter(color),
      delta,
    });

  return (
    <div
      data-testid={playerId ? 'mana-pool' : 'opponent-mana-pool'}
      role="group"
      aria-label="Mana pool"
      className="flex items-center gap-1"
    >
      {shown.map((color) => {
        const count = counters[manaCounter(color)] ?? 0;
        const pip = classNames(
          'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums',
          manaStyles[color],
          count === 0 && 'opacity-40'
        );
        const label = `${count} ${manaNames[color]} mana`;
        return playerId ? (
          <button
            key={color}
            type="button"
            data-mana={color}
            data-count={count}
            aria-label={`${label}; click to add, right-click to remove`}
            title={`${manaNames[color]}: click +1, right-click −1`}
            className={classNames(pip, 'hover:brightness-125')}
            onClick={() => adjust(color, 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (count > 0) adjust(color, -1);
            }}
          >
            {count > 0 ? count : color}
          </button>
        ) : (
          <span
            key={color}
            data-mana={color}
            data-count={count}
            aria-label={label}
            className={pip}
          >
            {count}
          </span>
        );
      })}
      {playerId && !empty && (
        <button
          type="button"
          aria-label="Empty mana pool"
          title="Empty mana pool"
          className="ml-auto rounded bg-slate-700 px-1 text-[11px] hover:bg-slate-500"
          onClick={() => dispatch({ type: 'emptyManaPool', playerId })}
        >
          Empty
        </button>
      )}
    </div>
  );
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
      (name) =>
        !(playerCounterNames as readonly string[]).includes(name) &&
        !isManaCounter(name)
    ),
  ];
  const shown = playerId ? names : names.filter((n) => counters[n]);
  const pool = <ManaPool counters={counters} playerId={playerId} />;
  if (shown.length === 0) return pool;

  return (
    <>
      {pool}
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
    </>
  );
};

export default PlayerCounters;
