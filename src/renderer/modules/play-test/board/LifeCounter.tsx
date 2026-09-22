import classNames from 'classnames';

import { dispatch } from '../viewStore';
import { lifeFlashClass } from './lifeFlash';
import useValueFlash from './useValueFlash';

interface Props {
  playerId: string;
  life: number;
  // Smaller, for a board shared with an opponent.
  compact?: boolean;
  onSetLife(): void;
}

const steps = [-5, -1, 1, 5];

const stepLabel = (delta: number) =>
  `${delta < 0 ? 'Lose' : 'Gain'} ${Math.abs(delta)} life`;

// Big and high-contrast because the board is what gets screenshared.
const LifeCounter = ({ playerId, life, compact, onSetLife }: Props) => {
  const flash = useValueFlash(life);
  return (
    <div className="flex flex-col items-center rounded-lg bg-slate-900 px-2 py-2">
      <div className="text-xs uppercase tracking-widest text-slate-400">
        Life
      </div>
      <button
        type="button"
        aria-label="Set life"
        data-testid="life"
        data-flash={flash ?? undefined}
        className={classNames(
          compact ? 'text-5xl' : 'text-7xl',
          'font-black leading-none tabular-nums hover:text-amber-200',
          lifeFlashClass(flash, 'text-white')
        )}
        onClick={onSetLife}
      >
        {life}
      </button>
      <div className="mt-2 flex gap-1">
        {steps.map((delta) => (
          <button
            key={delta}
            type="button"
            aria-label={stepLabel(delta)}
            className="w-12 rounded bg-slate-700 py-1 text-lg font-bold text-white hover:bg-slate-600"
            onClick={() => dispatch({ type: 'adjustLife', playerId, delta })}
          >
            {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LifeCounter;
