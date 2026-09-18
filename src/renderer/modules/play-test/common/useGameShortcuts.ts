import type { PublicView } from '@shared/game';
import { useEffect, useRef } from 'react';

import { dispatch } from '../viewStore';

export const shortcutList = [
  { key: 'D', description: 'Draw a card' },
  { key: 'U', description: 'Untap all your permanents' },
  { key: 'S', description: 'Shuffle your library' },
  { key: 'M', description: 'Mulligan (until you keep)' },
  { key: '?', description: 'Show or hide this help' },
  { key: 'Esc', description: 'Close a dialog or menu' },
];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface Options {
  // Game keys are off while a dialog is open; ? still toggles help.
  enabled: boolean;
  onHelp(): void;
}

// The same game keys in every play test window. Keys with a modifier are
// left alone so Cmd/Ctrl+R (reload) and other accelerators still work.
export const useGameShortcuts = (
  view: PublicView | null,
  { enabled, onHelp }: Options
) => {
  const latest = useRef({ view, enabled, onHelp });
  useEffect(() => {
    latest.current = { view, enabled, onHelp };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { view: current, enabled: on, onHelp: help } = latest.current;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        help();
        return;
      }
      if (!on || !current) return;
      const playerId = current.playerId;

      switch (e.key.toLowerCase()) {
        case 'd':
          if (current.libraryCount > 0) {
            dispatch({ type: 'draw', playerId, count: 1 });
          }
          break;
        case 'u':
          dispatch({ type: 'untapAll', playerId });
          break;
        case 's':
          dispatch({ type: 'shuffle', playerId });
          break;
        case 'm':
          if (!current.keptHand) dispatch({ type: 'mulligan', playerId });
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
};
