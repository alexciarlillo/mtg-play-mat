import type { CardView } from '@shared/game';
import classNames from 'classnames';

import { loyalty, otherCounters, powerToughness } from './cardStats';

// Sentence case, so "first strike" reads as a badge, not a sentence.
const abilityLabel = (ability: string) =>
  ability.charAt(0).toUpperCase() + ability.slice(1);

const chipBase =
  'rounded px-1.5 text-xs font-semibold text-white shadow ring-1 ring-white/40 tabular-nums';
const chip = `${chipBase} bg-slate-900/85`;

// Counters and derived stats drawn over a card, from its view alone, so
// the same badges show on the owner's board and the opponent's. owner
// labels a permanent controlled by someone other than its owner.
const CardBadges = ({
  card,
  owner = null,
}: {
  card: CardView;
  owner?: string | null;
}) => {
  const pt = powerToughness(card);
  const walker = loyalty(card);
  const counters = otherCounters(card);
  const abilities = card.abilities ?? [];
  const marks = card.doesntUntap || abilities.length > 0;

  return (
    <>
      {counters.length > 0 && (
        <div className="pointer-events-none absolute left-1 top-[14%] flex max-w-[90%] flex-col items-start gap-0.5">
          {counters.map(([name, count]) => (
            <span
              key={name}
              data-testid="counter-chip"
              data-counter={name}
              data-count={count}
              className={chip}
            >
              {name} ×{count}
            </span>
          ))}
        </div>
      )}
      {card.isToken && (
        <span
          data-testid="token-badge"
          className="pointer-events-none absolute right-1 top-1 rounded bg-amber-300 px-1 text-[10px] font-bold uppercase text-slate-900 shadow"
        >
          Token
        </span>
      )}
      {marks && (
        <div
          data-testid="ability-badges"
          className="pointer-events-none absolute right-1 top-[14%] flex max-w-[70%] flex-col items-end gap-0.5"
        >
          {card.doesntUntap && (
            <span
              data-testid="doesnt-untap-badge"
              title="Doesn't untap"
              className={classNames(chipBase, 'bg-rose-800/90')}
            >
              No untap
            </span>
          )}
          {abilities.map((ability) => (
            <span
              key={ability}
              data-testid="ability-badge"
              data-ability={ability}
              title={ability}
              className={classNames(
                chipBase,
                'max-w-full truncate',
                ability.toLowerCase() === 'goaded'
                  ? 'bg-orange-700/90'
                  : 'bg-indigo-800/90'
              )}
            >
              {abilityLabel(ability)}
            </span>
          ))}
        </div>
      )}
      {owner && (
        <span
          data-testid="owner-badge"
          title={`Owned by ${owner}`}
          className="pointer-events-none absolute bottom-1 left-1 max-w-[60%] truncate rounded bg-violet-700 px-1 text-[10px] font-bold text-white shadow ring-1 ring-white/60"
        >
          {owner}
        </span>
      )}
      {(pt !== null || walker !== null) && (
        <div className="pointer-events-none absolute bottom-1 right-1 flex gap-1">
          {walker !== null && (
            <span
              data-testid="loyalty-badge"
              className="rounded-b-xl rounded-t bg-slate-900/90 px-2 text-base font-black text-white shadow ring-2 ring-amber-200 tabular-nums"
            >
              {walker}
            </span>
          )}
          {pt !== null && (
            <span
              data-testid="pt-badge"
              data-set={card.ptOverride ? true : undefined}
              title={
                card.ptOverride
                  ? `Base set to ${card.ptOverride.power}/${card.ptOverride.toughness}`
                  : undefined
              }
              className={classNames(
                'rounded bg-white px-1.5 text-base font-black text-slate-900 shadow ring-2 tabular-nums',
                card.ptOverride ? 'ring-amber-500' : 'ring-slate-900'
              )}
            >
              {pt}
            </span>
          )}
        </div>
      )}
    </>
  );
};

export default CardBadges;
