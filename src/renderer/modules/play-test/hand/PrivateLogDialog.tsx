import type { PrivateLogEntry } from '@shared/game';
import { useLayoutEffect, useRef } from 'react';

import { Modal } from '../common/Dialogs';

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Lines only this player sees: cards shown to them, and cards they
// showed someone. Never part of the table log, which the board shows.
const PrivateLogDialog = ({
  entries,
  onClose,
}: {
  entries: PrivateLogEntry[];
  onClose(): void;
}) => {
  const end = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [entries.length]);
  return (
    <Modal title="Private log" onClose={onClose} medium>
      <ol data-testid="private-log" className="flex flex-col gap-1 text-sm">
        {entries.map((entry, i) => (
          <li
            key={entry.id}
            ref={i === entries.length - 1 ? end : undefined}
            data-testid="private-log-entry"
          >
            <span className="mr-2 text-xs text-slate-500">
              {time(entry.at)}
            </span>
            {entry.text}
          </li>
        ))}
      </ol>
    </Modal>
  );
};

export default PrivateLogDialog;
