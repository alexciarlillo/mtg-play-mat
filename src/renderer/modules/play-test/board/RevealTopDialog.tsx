import { MAX_REVEALED_CARDS, type PlayerId } from '@shared/game';
import type { RevealTarget } from '@shared/net/revealTargets';

import { NumberPrompt } from '../common/Dialogs';
import RevealTargetSelect from '../common/RevealTargetSelect';
import { EVERYONE, revealTo, useRevealChoice } from '../common/targetedReveal';
import { dispatch } from '../viewStore';

interface Props {
  playerId: PlayerId;
  libraryCount: number;
  targets: RevealTarget[];
  onClose(): void;
}

// Shows the top N cards to everyone, or to one player alone. Either way
// this board never holds them: a reveal to one player is read in main.
const RevealTopDialog = ({
  playerId,
  libraryCount,
  targets,
  onClose,
}: Props) => {
  const to = useRevealChoice(targets);
  return (
    <NumberPrompt
      title="Reveal cards"
      label="How many from the top?"
      initial={1}
      min={1}
      max={Math.max(1, Math.min(libraryCount, MAX_REVEALED_CARDS))}
      blocked={!to.ready}
      onSubmit={(count) => {
        if (to.value === EVERYONE) {
          dispatch({ type: 'reveal', playerId, source: 'libraryTop', count });
        } else {
          revealTo({ to: to.value, source: 'libraryTop', count });
        }
      }}
      onClose={onClose}
    >
      {(targets.length > 0 || to.value !== EVERYONE) && (
        <label className="flex flex-col gap-1 text-sm">
          Reveal to
          <RevealTargetSelect
            label="Reveal to"
            targets={targets}
            choice={to}
            className="rounded bg-white px-2 py-1 ring-1 ring-slate-400"
          />
        </label>
      )}
    </NumberPrompt>
  );
};

export default RevealTopDialog;
