import type { PlayTestStatus } from '@shared/types/playTest';
import { useEffect, useState } from 'react';

const closed: PlayTestStatus = {
  open: false,
  deck: null,
  sampleDeck: false,
  handInBoard: false,
};

// Whether a game is open, kept live by main's playTestStatus pushes.
const usePlayTestStatus = (): PlayTestStatus => {
  const [status, setStatus] = useState<PlayTestStatus>(closed);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onPlayTestStatus((next) => {
      pushed = true;
      setStatus(next);
    });
    // A push that lands first is newer than this snapshot.
    void window.api.getPlayTestStatus().then((initial) => {
      if (!pushed) setStatus(initial);
    });
    return unsubscribe;
  }, []);

  return status;
};

export default usePlayTestStatus;
