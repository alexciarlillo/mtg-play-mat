import {
  type DebugEntry,
  type DebugLevel,
  formatDebugEnv,
  formatDebugReport,
  formatDebugTime,
} from '@shared/debug';
import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import useDebugLog from './useDebugLog';

const button =
  'rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm bg-white ' +
  'text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50';

// Dark, so the levels read at a glance and a screenshot of it is
// obviously the log rather than part of the page.
const LEVEL_CLASS: Record<DebugLevel, string> = {
  debug: 'text-gray-400',
  info: 'text-gray-100',
  warn: 'text-amber-300',
  error: 'text-red-400',
};

const Line = ({ entry }: { entry: DebugEntry }) => (
  <li className={classNames('whitespace-pre-wrap', LEVEL_CLASS[entry.level])}>
    <span className="text-gray-500">{formatDebugTime(entry.at)}</span>{' '}
    <span className="text-gray-400">{entry.scope}</span> {entry.text}
    {entry.count > 1 && <span className="text-gray-500"> ×{entry.count}</span>}
  </li>
);

// What a player screenshots and sends when a game will not connect: what
// the networked paths did, and any exception the app hit along the way.
const DebugLogPanel = () => {
  const { snapshot, clear } = useDebugLog();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const { entries } = snapshot;

  // The newest line is the one that matters, so follow the tail.
  useEffect(() => {
    const node = list.current;
    if (open && node) node.scrollTop = node.scrollHeight;
  }, [open, entries]);

  const copy = () => {
    navigator.clipboard.writeText(formatDebugReport(snapshot)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      (err: unknown) => console.error('[debug] copy failed', err)
    );
  };

  return (
    <section data-testid="debug-log" className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide debug log' : 'Show debug log'}
        </button>
        {open && (
          <>
            <button type="button" className={button} onClick={copy}>
              {copied ? 'Copied' : 'Copy log'}
            </button>
            <button type="button" className={button} onClick={clear}>
              Clear
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            If a game will not connect, clear this, try again, then screenshot
            or copy it and send it over. It records what multiplayer did, never
            your cards.
          </p>
          <div className="rounded-lg bg-gray-900 p-3 font-mono text-xs">
            <p data-testid="debug-env" className="pb-2 text-gray-300">
              {formatDebugEnv(snapshot.env)}
            </p>
            <ol
              ref={list}
              data-testid="debug-entries"
              className="max-h-96 space-y-0.5 overflow-y-auto"
            >
              {entries.map((entry) => (
                <Line key={entry.id} entry={entry} />
              ))}
            </ol>
            {entries.length === 0 && (
              <p className="text-gray-500">Nothing logged yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default DebugLogPanel;
