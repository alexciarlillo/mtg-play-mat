import { phases, type PublicView } from '@shared/game';
import classNames from 'classnames';
import { useState } from 'react';

import {
  loadTurnSettings,
  saveTurnSettings,
  type TurnSettings,
} from '../common/turnSettings';
import { dispatch } from '../viewStore';
import { phaseLabels } from './phases';

interface Props {
  view: PublicView;
  compact?: boolean;
}

const TurnPanel = ({ view, compact }: Props) => {
  const [settings, setSettings] = useState(loadTurnSettings);
  const { playerId } = view;
  const turn = view.turn ?? 1;

  const toggle = (key: keyof TurnSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    saveTurnSettings(next);
  };

  return (
    <div
      data-testid="turn-panel"
      className={classNames(
        'flex flex-col rounded-lg bg-slate-900 px-2',
        compact ? 'gap-1 py-1' : 'gap-2 py-2'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Turn
        </span>
        <span
          data-testid="turn"
          className={classNames(
            'font-black leading-none tabular-nums text-white',
            compact ? 'text-2xl' : 'text-3xl'
          )}
        >
          {turn}
        </span>
        <div className="ml-auto flex flex-col text-[11px] leading-tight text-slate-300">
          <label
            className="flex items-center gap-1"
            title="Next turn untaps all your permanents"
          >
            <input
              type="checkbox"
              checked={settings.untap}
              onChange={() => toggle('untap')}
            />
            untap all
          </label>
          <label
            className="flex items-center gap-1"
            title="Next turn draws a card"
          >
            <input
              type="checkbox"
              checked={settings.draw}
              onChange={() => toggle('draw')}
            />
            draw 1
          </label>
        </div>
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-600"
          onClick={() => dispatch({ type: 'nextTurn', playerId, ...settings })}
        >
          Next turn
        </button>
      </div>
      <div role="group" aria-label="Phase" className="grid grid-cols-7 gap-0.5">
        {phases.map((phase) => (
          <button
            key={phase}
            type="button"
            aria-pressed={view.phase === phase}
            data-testid={`phase-${phase}`}
            className={classNames(
              'truncate rounded py-0.5 text-[10px] font-medium',
              view.phase === phase
                ? 'bg-amber-300 text-slate-900'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            )}
            onClick={() => dispatch({ type: 'setPhase', playerId, phase })}
          >
            {phaseLabels[phase]}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TurnPanel;
