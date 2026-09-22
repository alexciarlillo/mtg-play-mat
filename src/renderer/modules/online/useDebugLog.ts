import { type DebugSnapshot, emptyDebugSnapshot } from '@shared/debug';
import { useCallback, useEffect, useState } from 'react';

interface DebugLogState {
  snapshot: DebugSnapshot;
  clear(): void;
}

// The debug log, kept live by main's pushes.
const useDebugLog = (): DebugLogState => {
  const [snapshot, setSnapshot] = useState<DebugSnapshot>(emptyDebugSnapshot);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onDebugLog((next) => {
      pushed = true;
      setSnapshot(next);
    });
    // A push that lands first is newer than this snapshot.
    window.api.getDebugLog().then(
      (initial) => {
        if (!pushed) setSnapshot(initial);
      },
      (err: unknown) => console.error('[debug] could not read the log', err)
    );
    return unsubscribe;
  }, []);

  const clear = useCallback(() => {
    window.api.clearDebugLog().then(setSnapshot, (err: unknown) => {
      console.error('[debug] could not clear the log', err);
    });
  }, []);

  return { snapshot, clear };
};

export default useDebugLog;
