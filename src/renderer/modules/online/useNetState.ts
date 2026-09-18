import { idleNetState, type NetState } from '@shared/net/lobby';
import { useEffect, useState } from 'react';

// The lobby state, kept live by main's netState pushes.
const useNetState = (): NetState => {
  const [state, setState] = useState<NetState>(idleNetState);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onNetState((next) => {
      pushed = true;
      setState(next);
    });
    // A push that lands first is newer than this snapshot.
    void window.api.getNetState().then((initial) => {
      if (!pushed) setState(initial);
    });
    return unsubscribe;
  }, []);

  return state;
};

export default useNetState;
