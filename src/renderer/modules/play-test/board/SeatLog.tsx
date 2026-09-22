import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import type { PlayerId } from '@shared/game';
import type { TableEntry } from '@shared/net/remoteViews';
import classNames from 'classnames';

import { describeRoll, entriesFor } from './pod';

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Line = ({ entry }: { entry: TableEntry }) => (
  <li
    data-testid="seat-log-entry"
    data-kind={entry.kind}
    className={classNames(
      'flex gap-1',
      entry.kind === 'roll' ? 'text-amber-200' : 'text-slate-200'
    )}
  >
    <time
      dateTime={new Date(entry.at).toISOString()}
      className="shrink-0 tabular-nums text-slate-500"
    >
      {time(entry.at)}
    </time>
    <span className="min-w-0">
      {entry.kind === 'roll' ? describeRoll(entry.event.roll) : entry.text}
    </span>
  </li>
);

// One player's own history, under their seat: newest first, and folded
// away when it is more noise than context. Open, it takes whatever room
// the opponents row has left over, so dragging the row taller buys more
// of it without taking anything from the counts above.
const SeatLog = ({
  log,
  playerId,
  name,
  open,
  compact = false,
  onToggle,
}: {
  log: TableEntry[];
  playerId: PlayerId;
  name: string;
  open: boolean;
  compact?: boolean;
  onToggle?(): void;
}) => {
  const entries = entriesFor(log, playerId);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

  return (
    <section
      data-testid="seat-log"
      data-open={open || undefined}
      data-entries={entries.length}
      className={classNames(
        'flex min-h-0 flex-col border-t border-slate-600',
        open ? (compact ? 'min-h-16 flex-1' : 'min-h-24 flex-1') : 'shrink-0'
      )}
    >
      <button
        type="button"
        data-testid="seat-log-toggle"
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} ${name}'s log`}
        className={classNames(
          'flex shrink-0 items-center gap-1 text-left uppercase tracking-wide text-slate-400 hover:text-slate-200',
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
        )}
        onClick={onToggle}
      >
        <Chevron className="size-3 shrink-0" />
        <span className="truncate">Log</span>
        {entries.length > 0 && (
          <span className="tabular-nums text-slate-500">{entries.length}</span>
        )}
      </button>
      {open && (
        <ol
          aria-label={`${name}'s log`}
          data-testid="seat-log-list"
          className={classNames(
            'scroll-visible min-h-0 flex-1 overflow-y-auto',
            compact ? 'px-2 pb-1 text-[10px]' : 'px-3 pb-2 text-[11px]'
          )}
        >
          {entries.length === 0 ? (
            <li className="text-slate-500">Nothing yet.</li>
          ) : (
            entries.map((entry) => <Line key={entry.id} entry={entry} />)
          )}
        </ol>
      )}
    </section>
  );
};

export default SeatLog;
