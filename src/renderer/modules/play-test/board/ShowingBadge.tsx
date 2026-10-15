import type { ShowingView } from '@shared/game';
import classNames from 'classnames';

import { showingToName } from '../common/targetedReveal';

interface Props {
  // The revealer, as everyone at the table knows them.
  name: string;
  showing: ShowingView | null | undefined;
  selfId: string | undefined;
  // Player ids to names, for whoever the cards are shown to.
  names: Record<string, string>;
  compact?: boolean;
  testId?: string;
}

const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`;

// Says that one player is showing another some cards. It never says
// which: only the player shown them sees those, in their hand window.
const ShowingBadge = ({
  name,
  showing,
  selfId,
  names,
  compact = false,
  testId = 'showing-badge',
}: Props) => {
  if (!showing) return null;
  const to = showingToName(showing.to, selfId, names);
  return (
    <div
      data-testid={testId}
      data-to={showing.to}
      data-count={showing.count}
      className={classNames(
        'pointer-events-none absolute left-2 top-2 z-30 max-w-[calc(100%-1rem)] truncate rounded-full bg-violet-900/90 font-semibold text-violet-50 shadow-lg ring-2 ring-violet-300',
        compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {name} is showing {to} {cards(showing.count)}
    </div>
  );
};

export default ShowingBadge;
