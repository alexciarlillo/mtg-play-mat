import type { LibraryActivity } from '@shared/game';
import { useEffect } from 'react';

const send = (activity: LibraryActivity | null) => {
  window.api.setLibraryActivity(activity).catch((err: unknown) => {
    console.error('[play-test] failed to share library activity', err);
  });
};

// Shows the table what this dialog is doing for as long as it's open.
export const useLibraryActivity = (activity: LibraryActivity) => {
  const { kind } = activity;
  const count = activity.kind === 'look' ? activity.count : 0;

  useEffect(() => {
    send(kind === 'look' ? { kind, count } : { kind });
  }, [kind, count]);

  useEffect(() => () => send(null), []);
};
