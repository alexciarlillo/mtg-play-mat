import type { UndoState } from '@shared/game';
import { useEffect, useState } from 'react';

const none: UndoState = { canUndo: false, canRedo: false };

const logError = (err: unknown) => {
  console.error('[play-test] failed to load undo state', err);
};

// Main keeps the history; this only mirrors whether each way is open.
export const useUndoState = (): UndoState => {
  const [state, setState] = useState<UndoState>(none);
  useEffect(() => {
    let fresh = true;
    const off = window.api.onUndoState((next) => {
      fresh = false;
      setState(next);
    });
    window.api.getUndoState().then((initial) => {
      if (fresh) setState(initial);
    }, logError);
    return off;
  }, []);
  return state;
};
