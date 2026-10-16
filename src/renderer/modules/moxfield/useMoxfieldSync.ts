import type { MoxfieldSyncStatus } from '@shared/moxfield';
import { useEffect, useState } from 'react';

// The Moxfield sync's state, kept live by main's moxfieldSync pushes.
const useMoxfieldSync = (): MoxfieldSyncStatus | null => {
  const [status, setStatus] = useState<MoxfieldSyncStatus | null>(null);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onMoxfieldSync((next) => {
      pushed = true;
      setStatus(next);
    });
    // A push that lands first is newer than this snapshot.
    void window.api.getMoxfieldSync().then((initial) => {
      if (!pushed) setStatus(initial);
    });
    return unsubscribe;
  }, []);

  return status;
};

export default useMoxfieldSync;
