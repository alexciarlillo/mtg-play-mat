import type { PublicView } from '@shared/game';
import { useEffect, useRef } from 'react';

import { dispatch, redo, undo } from '../viewStore';

export const shortcutList = [
  { key: 'D', description: 'Draw a card' },
  { key: 'U', description: 'Untap all your permanents' },
  { key: 'S', description: 'Shuffle your library' },
  { key: 'M', description: 'Mulligan (until you keep)' },
  { key: '⌘/Ctrl+Z', description: 'Undo your last action' },
  { key: '⇧⌘/Ctrl+Z', description: 'Redo' },
  { key: '?', description: 'Show or hide this help' },
  { key: 'Esc', description: 'Close a dialog or menu' },
];

// Checkboxes and buttons take no text, so game keys still work on them.
const nonTextInputs = ['checkbox', 'radio', 'button', 'submit', 'range'];

const isTyping = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) {
    return !nonTextInputs.includes(target.type);
  }
  return (
    target.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target.tagName)
  );
};

interface Options {
  // Game keys are off while a dialog is open; ? still toggles help.
  enabled: boolean;
  onHelp(): void;
}

// Cmd/Ctrl+Z, with Shift to redo. Alt is left for other accelerators.
const undoKey = (e: KeyboardEvent): 'undo' | 'redo' | null => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') {
    return null;
  }
  return e.shiftKey ? 'redo' : 'undo';
};

// The same game keys in every play test window. Other keys with a
// modifier are left alone so Cmd/Ctrl+R (reload) and the like still work.
// A text field keeps its own undo.
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
      if (isTyping(e.target)) return;
      const history = undoKey(e);
      if (history) {
        e.preventDefault();
        if (on && current) (history === 'undo' ? undo : redo)();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

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
