import {
  type CommanderDamage,
  type DummyOpponent,
  LETHAL_COMMANDER_DAMAGE,
} from '@shared/game';
import classNames from 'classnames';

import { dispatch } from '../viewStore';
import type { DamageSource } from './commanders';

// Sources still worth a row: the given ones, plus any that already dealt
// damage (e.g. an opponent who has since left).
const rowsFor = (
  sources: DamageSource[],
  taken: CommanderDamage[]
): (DamageSource & { damage: number })[] => {
  const damage = new Map(taken.map((entry) => [entry.source, entry.damage]));
  const known = new Set(sources.map((s) => s.source));
  return [
    ...sources.map((s) => ({ ...s, damage: damage.get(s.source) ?? 0 })),
    ...taken.filter((entry) => !known.has(entry.source)),
  ];
};

const stepButton =
  'w-7 rounded bg-slate-700 text-sm font-bold text-white hover:bg-slate-600';

const DamageRow = ({
  name,
  damage,
  target,
  onAdjust,
}: {
  name: string;
  damage: number;
  // Who took the damage, when it is not the panel's own player.
  target?: string;
  onAdjust?(delta: number): void;
}) => {
  const lethal = damage >= LETHAL_COMMANDER_DAMAGE;
  const what = `commander damage from ${name}${target ? ` to ${target}` : ''}`;
  return (
    <div
      data-testid="commander-damage"
      data-source-name={name}
      data-damage={damage}
      data-lethal={lethal || undefined}
      className={classNames(
        'flex items-center gap-1 rounded px-1 text-sm',
        lethal && 'bg-red-700 text-white'
      )}
    >
      <span className="flex-1 truncate" title={name}>
        {name}
      </span>
      {lethal && (
        <span className="text-xs font-bold uppercase">
          {LETHAL_COMMANDER_DAMAGE}+ lethal
        </span>
      )}
      {onAdjust && (
        <button
          type="button"
          aria-label={`Less ${what}`}
          className={stepButton}
          onClick={() => onAdjust(-1)}
        >
          −
        </button>
      )}
      <span className="w-7 text-center font-bold tabular-nums">{damage}</span>
      {onAdjust && (
        <button
          type="button"
          aria-label={`More ${what}`}
          className={stepButton}
          onClick={() => onAdjust(1)}
        >
          +
        </button>
      )}
    </div>
  );
};

interface TakenProps {
  // Null for an opponent's panel, which is read-only.
  playerId: string | null;
  sources: DamageSource[];
  taken: CommanderDamage[];
  testId?: string;
}

// Commander damage a player has taken, per opposing commander. Changing it
// also changes life, since commander damage is ordinary damage too.
export const CommanderDamageTaken = ({
  playerId,
  sources,
  taken,
  testId = 'commander-damage-taken',
}: TakenProps) => {
  const rows = rowsFor(sources, taken);
  if (rows.length === 0) return null;
  return (
    <section data-testid={testId} className="flex flex-col gap-0.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
        Commander damage taken
      </h3>
      {rows.map((row) => (
        <DamageRow
          key={row.source}
          name={row.name}
          damage={row.damage}
          onAdjust={
            playerId === null
              ? undefined
              : (delta) =>
                  dispatch({
                    type: 'adjustCommanderDamage',
                    playerId,
                    source: row.source,
                    sourceName: row.name,
                    delta,
                  })
          }
        />
      ))}
    </section>
  );
};

interface DummiesProps {
  playerId: string;
  dummies: DummyOpponent[];
  // The player's own commanders, which deal the damage dummies take.
  commanders: DamageSource[];
}

const lifeSteps = [-5, -1, 1, 5];

// Stand-in opponents for solo play: a life total and the commander damage
// each took from the player's commanders.
export const DummyOpponents = ({
  playerId,
  dummies,
  commanders,
}: DummiesProps) => {
  if (dummies.length === 0) return null;
  return (
    <section data-testid="dummies" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
        Placeholder opponents
      </h3>
      {dummies.map((dummy) => (
        <div
          key={dummy.id}
          data-testid="dummy"
          data-name={dummy.name}
          className="flex flex-col gap-1 rounded-lg bg-slate-900/60 p-2"
        >
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-sm font-semibold">
              {dummy.name}
            </span>
            <span
              data-testid="dummy-life"
              className={classNames(
                'mr-1 text-2xl font-black tabular-nums',
                dummy.life <= 0 && 'text-red-400'
              )}
            >
              {dummy.life}
            </span>
            <button
              type="button"
              aria-label={`Remove ${dummy.name}`}
              className="rounded px-1 text-lg leading-none text-slate-400 hover:bg-slate-700 hover:text-white"
              onClick={() =>
                dispatch({ type: 'removeDummy', playerId, dummyId: dummy.id })
              }
            >
              ×
            </button>
          </div>
          <div className="flex gap-1">
            {lifeSteps.map((delta) => (
              <button
                key={delta}
                type="button"
                aria-label={`${dummy.name} ${delta < 0 ? 'loses' : 'gains'} ${Math.abs(delta)} life`}
                className="flex-1 rounded bg-slate-700 text-sm font-bold text-white hover:bg-slate-600"
                onClick={() =>
                  dispatch({
                    type: 'adjustDummyLife',
                    playerId,
                    dummyId: dummy.id,
                    delta,
                  })
                }
              >
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </button>
            ))}
          </div>
          {rowsFor(commanders, dummy.commanderDamage).map((row) => (
            <DamageRow
              key={row.source}
              name={row.name}
              damage={row.damage}
              target={dummy.name}
              onAdjust={(delta) =>
                dispatch({
                  type: 'adjustCommanderDamage',
                  playerId,
                  dummyId: dummy.id,
                  source: row.source,
                  sourceName: row.name,
                  delta,
                })
              }
            />
          ))}
        </div>
      ))}
    </section>
  );
};
