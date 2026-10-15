import type { RevealTarget } from '@shared/net/revealTargets';

import {
  EVERYONE,
  type RevealChoiceState,
  targetLabel,
} from './targetedReveal';

interface Props {
  label: string;
  targets: RevealTarget[];
  choice: RevealChoiceState;
  disabled?: boolean;
  className?: string;
}

// "Everyone" first, then each other player; one who can't take a reveal
// is greyed out, and a hint says why. A chosen player who stops being
// able to stays chosen and is flagged, so nothing reaches everyone by
// accident.
const RevealTargetSelect = ({
  label,
  targets,
  choice,
  disabled,
  className,
}: Props) => {
  const greyed = targets.some((target) => !target.ready);
  return (
    <>
      <select
        aria-label={label}
        aria-invalid={!choice.ready || undefined}
        className={className}
        value={choice.value}
        disabled={disabled}
        onChange={(e) => choice.set(e.target.value)}
      >
        <option value={EVERYONE}>Everyone</option>
        {targets.map((target) => (
          <option
            key={target.playerId}
            value={target.playerId}
            disabled={!target.ready}
          >
            {targetLabel(target)}
          </option>
        ))}
        {choice.gone && (
          <option value={choice.value} disabled>
            {choice.name} (left the table)
          </option>
        )}
      </select>
      {!choice.ready ? (
        <span
          data-testid="reveal-target-unavailable"
          role="alert"
          className="text-xs font-semibold text-red-700"
        >
          {choice.name} can’t be shown cards now ({choice.why}). Choose someone
          else.
        </span>
      ) : (
        greyed && (
          <span
            data-testid="reveal-target-hint"
            className="text-xs text-slate-500"
          >
            Greyed-out players can’t be shown cards yet.
          </span>
        )
      )}
    </>
  );
};

export default RevealTargetSelect;
