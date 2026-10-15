import type { SeenEntry } from '@shared/game';
import type { RollRequest } from '@shared/net/protocol';
import type { TableEntry } from '@shared/net/remoteViews';
import classNames from 'classnames';
import { type UIEvent, useLayoutEffect, useRef, useState } from 'react';

import SeenEntries from '../common/SeenEntries';
import { describeEvent, requestRoll, rollTotal } from './pod';

type Tab = 'log' | 'dice' | 'revealed';

const tabs: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'dice', label: 'Dice' },
  { id: 'revealed', label: 'Revealed' },
];

const button =
  'rounded bg-slate-700 px-1 py-0.5 text-sm font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-700';

const dice: { label: string; name: string; request: RollRequest }[] = [
  { label: 'd4', name: 'Roll a d4', request: { type: 'die', sides: 4 } },
  { label: 'd6', name: 'Roll a d6', request: { type: 'die', sides: 6 } },
  { label: 'd8', name: 'Roll a d8', request: { type: 'die', sides: 8 } },
  { label: 'd12', name: 'Roll a d12', request: { type: 'die', sides: 12 } },
  { label: 'd20', name: 'Roll a d20', request: { type: 'die', sides: 20 } },
  {
    label: '2d6',
    name: 'Roll two d6',
    request: { type: 'dice', count: 2, sides: 6 },
  },
  { label: 'Planar', name: 'Roll the planar die', request: { type: 'planar' } },
  { label: 'Coin', name: 'Flip a coin', request: { type: 'coin' } },
];

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
        data-result={rollTotal(entry.event.roll)}
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

// What happens at the table: every action and roll (rolled by the host,
// so they read the same on every board), and the cards others revealed
// to the whole table this game, kept after their reveals end.
const TableLog = ({
  log,
  seen = [],
  onCustomDie,
  planarDie = true,
}: {
  log: TableEntry[];
  seen?: SeenEntry[];
  onCustomDie(): void;
  // Off when the host's build can't roll the planar die, or isn't known
  // yet. Several dice still work there, rolled one at a time.
  planarDie?: boolean;
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
      <div className="grid grid-cols-5 gap-1">
        {dice.map(({ label, name, request }) => {
          const unsupported = !planarDie && request.type === 'planar';
          return (
            <button
              key={label}
              type="button"
              className={button}
              aria-label={name}
              disabled={unsupported}
              title={
                unsupported
                  ? "The host's version of the app can't roll this, or isn't known yet"
                  : name
              }
              onClick={() => requestRoll(request)}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          className={button}
          aria-label="Roll another die"
          title="Roll another die"
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
      {tab === 'revealed' && (
        <div className="flex max-h-56 flex-col">
          <SeenEntries
            entries={seen}
            empty="Nobody has revealed anything yet."
            testId="seen-list"
          />
        </div>
      )}
      <div className={classNames('relative', tab === 'revealed' && 'hidden')}>
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
