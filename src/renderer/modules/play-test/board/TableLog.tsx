import type { TableEntry } from '@shared/net/remoteViews';
import classNames from 'classnames';
import { type UIEvent, useLayoutEffect, useRef, useState } from 'react';

import { describeEvent, requestRoll } from './pod';

type Tab = 'log' | 'dice';

const tabs: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'dice', label: 'Dice' },
];

const button =
  'flex-1 rounded bg-slate-700 px-1 py-0.5 text-sm font-bold text-white hover:bg-slate-600';

// Close enough to the end to keep following new entries.
const END_SLACK = 8;

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Entry = ({ entry }: { entry: TableEntry }) => {
  const stamp = (
    <>
      <time
        dateTime={new Date(entry.at).toISOString()}
        className="text-xs text-slate-500 tabular-nums"
      >
        {time(entry.at)}
      </time>{' '}
    </>
  );
  if (entry.kind === 'roll') {
    return (
      <li
        data-testid="table-event"
        data-by={entry.event.byName}
        data-result={String(entry.event.roll.result)}
        className="text-amber-200"
      >
        {stamp}
        <span>{describeEvent(entry.event)}</span>
      </li>
    );
  }
  return (
    <li
      data-testid="log-entry"
      data-by={entry.playerName}
      className="text-slate-200"
    >
      {stamp}
      <span className="font-semibold text-sky-200">
        {entry.playerName}
      </span>{' '}
      <span>{entry.text}</span>
    </li>
  );
};

// What happens at the table: every player's actions and every roll, in
// one history everyone at the table sees. Dice are rolled by the host, so
// rolls read the same on every board.
const TableLog = ({
  log,
  onCustomDie,
}: {
  log: TableEntry[];
  onCustomDie(): void;
}) => {
  const [tab, setTab] = useState<Tab>('log');
  const list = useRef<HTMLOListElement>(null);
  // Follows new entries unless the reader has scrolled up to look back.
  const [following, setFollowing] = useState(true);
  const shown =
    tab === 'dice' ? log.filter((entry) => entry.kind === 'roll') : log;
  const latest = shown.at(-1)?.id;

  useLayoutEffect(() => {
    const el = list.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [latest, tab, following]);

  const onScroll = (e: UIEvent<HTMLOListElement>) => {
    const el = e.currentTarget;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= END_SLACK;
    if (atEnd !== following) setFollowing(atEnd);
  };

  return (
    <section data-testid="table-log" className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          className={button}
          aria-label="Roll a d6"
          onClick={() => requestRoll({ type: 'die', sides: 6 })}
        >
          d6
        </button>
        <button
          type="button"
          className={button}
          aria-label="Roll a d20"
          onClick={() => requestRoll({ type: 'die', sides: 20 })}
        >
          d20
        </button>
        <button
          type="button"
          className={button}
          aria-label="Flip a coin"
          onClick={() => requestRoll({ type: 'coin' })}
        >
          Coin
        </button>
        <button
          type="button"
          className={button}
          aria-label="Roll another die"
          onClick={onCustomDie}
        >
          dN…
        </button>
      </div>
      <div role="tablist" aria-label="Table log view" className="flex gap-1">
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
                : 'text-slate-400 hover:text-slate-200'
            )}
            onClick={() => {
              setTab(id);
              setFollowing(true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
        <ol
          ref={list}
          aria-label="Table log"
          data-testid="table-log-list"
          data-tab={tab}
          className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-1 text-sm"
          onScroll={onScroll}
        >
          {shown.length === 0 && (
            <li className="text-slate-500">
              {tab === 'dice' ? 'No rolls yet.' : 'Nothing has happened yet.'}
            </li>
          )}
          {shown.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ol>
        {!following && (
          <button
            type="button"
            className="absolute bottom-1 right-2 rounded bg-slate-600 px-2 text-xs text-white shadow hover:bg-slate-500"
            onClick={() => setFollowing(true)}
          >
            Latest ↓
          </button>
        )}
      </div>
    </section>
  );
};

export default TableLog;
