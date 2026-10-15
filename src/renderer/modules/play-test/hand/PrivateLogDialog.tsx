import type { PrivateLogEntry, SeenEntry } from '@shared/game';
import classNames from 'classnames';
import { useLayoutEffect, useRef, useState } from 'react';

import { Modal } from '../common/Dialogs';
import SeenEntries from '../common/SeenEntries';

type Tab = 'log' | 'seen';

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const LogLines = ({ entries }: { entries: PrivateLogEntry[] }) => {
  const end = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [entries.length]);
  return (
    <ol data-testid="private-log" className="flex flex-col gap-1 text-sm">
      {entries.map((entry, i) => (
        <li
          key={entry.id}
          ref={i === entries.length - 1 ? end : undefined}
          data-testid="private-log-entry"
        >
          <span className="mr-2 text-xs text-slate-500">{time(entry.at)}</span>
          {entry.text}
        </li>
      ))}
    </ol>
  );
};

// Lines only this player sees: cards shown to them, and cards they
// showed someone. Never part of the table log, which the board shows.
// "Shown to you" keeps every card shown to this player this game.
const PrivateLogDialog = ({
  entries,
  seen,
  onClose,
}: {
  entries: PrivateLogEntry[];
  seen: SeenEntry[];
  onClose(): void;
}) => {
  const [tab, setTab] = useState<Tab>('log');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'log', label: 'Log' },
    { id: 'seen', label: `Shown to you (${seen.length})` },
  ];
  return (
    <Modal title="Private log" onClose={onClose} medium>
      <div
        role="tablist"
        aria-label="Private log view"
        className="mb-2 flex gap-1"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={classNames(
              'rounded px-2 text-xs font-semibold uppercase tracking-wide',
              tab === id
                ? 'bg-slate-600 text-white'
                : 'text-slate-500 hover:text-slate-800'
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'log' ? (
        <LogLines entries={entries} />
      ) : (
        <div className="rounded bg-slate-800 p-2">
          <SeenEntries
            entries={seen}
            empty="Nobody has shown you any cards this game."
            testId="seen-by-you"
          />
        </div>
      )}
    </Modal>
  );
};

export default PrivateLogDialog;
