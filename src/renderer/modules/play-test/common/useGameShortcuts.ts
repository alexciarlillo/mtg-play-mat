import type { PublicView } from '@shared/game';
import { useEffect, useRef } from 'react';

import { useCardPreview } from '../../../ui/CardPreview';
import { hoverKeyOf, letterOf } from '../../../ui/hoverKeys';
import { dispatch, redo, undo } from '../viewStore';
import { loadTurnSettings } from './turnSettings';

export interface Shortcut {
  key: string;
  description: string;
}

export const shortcutList: Shortcut[] = [
  { key: 'D', description: 'Draw a card' },
  { key: 'U', description: 'Untap all your permanents' },
  { key: 'S', description: 'Shuffle your library' },
  { key: 'M', description: 'Mulligan (until you keep)' },
  { key: 'N', description: 'Next turn (with turn tracking on)' },
  { key: 'V', description: 'Search your library' },
  { key: '⇧V', description: 'Look at the top of your library' },
  { key: 'R', description: 'Restart the game' },
  { key: '↑ / +', description: 'Gain 1 life' },
  { key: '↓ / −', description: 'Lose 1 life' },
  { key: '⌘/Ctrl+Z', description: 'Undo your last action' },
  { key: '⇧⌘/Ctrl+Z', description: 'Redo' },
  { key: '?', description: 'Show or hide this help' },
  { key: 'Esc', description: 'Close a dialog or menu' },
];

// Act on the card under the pointer: your permanents on the battlefield
// and the cards in your hand.
export const hoverShortcutList: Shortcut[] = [
  { key: 'T', description: 'Tap or untap' },
  { key: 'F', description: 'Transform, or turn face down / up' },
  { key: 'X', description: 'Create a token copy' },
  { key: 'B', description: 'Put onto the battlefield' },
  { key: 'H', description: 'Return to your hand' },
  { key: 'G', description: 'Put into the graveyard' },
  { key: 'E', description: 'Exile' },
  { key: 'L', description: 'Put on top of the library' },
  { key: '⇧L', description: 'Put on the bottom of the library' },
  { key: 'C', description: 'Move a commander to the command zone' },
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

// Arrows also move a slider or radio group, which must not cost life.
const isControl = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLSelectElement;

// A dialog or menu some part of the window opened on its own, such as an
// opponent's pile, holds the keys as much as one the host knows about.
const overlayOpen = () =>
  document.querySelector('[role="dialog"], [role="menu"]') !== null;

export type LibraryDialog = 'search' | 'look';

interface Options {
  // Game keys are off while a dialog is open; ? still toggles help.
  enabled: boolean;
  onHelp(): void;
  // Asks before starting over.
  onRestart(): void;
  // Opens a library dialog wherever the hand is.
  onLibraryDialog(dialog: LibraryDialog): void;
  // N moves the turn on only while turns are tracked.
  turnTracking: boolean;
  // Off for a part of a window whose host already handles the keys.
  listen?: boolean;
}

// Cmd/Ctrl+Z, with Shift to redo. Alt is left for other accelerators.
const undoKey = (e: KeyboardEvent): 'undo' | 'redo' | null => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') {
    return null;
  }
  return e.shiftKey ? 'redo' : 'undo';
};

const lifeDelta = (e: KeyboardEvent): number => {
  if (['+', '='].includes(e.key)) return 1;
  if (['-', '−'].includes(e.key)) return -1;
  if (isControl(e.target)) return 0;
  if (e.key === 'ArrowUp') return 1;
  if (e.key === 'ArrowDown') return -1;
  return 0;
};

// The same game keys in every play test window. Other keys with a
// modifier are left alone so Cmd/Ctrl+R (reload) and the like still work.
// A text field keeps its own undo.
export const useGameShortcuts = (view: PublicView | null, options: Options) => {
  const { listen = true } = options;
  const preview = useCardPreview();
  const latest = useRef({ view, options, preview });
  useEffect(() => {
    latest.current = { view, options, preview };
  });

  useEffect(() => {
    if (!listen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const { view: current, options: opts, preview: hovered } = latest.current;
      if (isTyping(e.target)) return;
      const on = opts.enabled && !overlayOpen();
      const history = undoKey(e);
      if (history) {
        e.preventDefault();
        if (on && current) (history === 'undo' ? undo : redo)();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        if (!e.repeat) opts.onHelp();
        return;
      }
      if (!on || !current) return;
      const playerId = current.playerId;

      // Held arrows or +/- run the life total, like the buttons' repeat.
      const delta = lifeDelta(e);
      if (delta !== 0) {
        e.preventDefault();
        dispatch({ type: 'adjustLife', playerId, delta });
        return;
      }
      if (e.repeat) return;
      const letter = letterOf(e);
      // Shift picks a variant of V and L only; other Shift combos are spare.
      if (e.shiftKey && letter !== 'v' && letter !== 'l') return;

      const hoverKey = hoverKeyOf(e);
      if (hoverKey) {
        if (hovered.pressHoverKey(hoverKey)) e.preventDefault();
        return;
      }

      switch (letter) {
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
        case 'n':
          if (opts.turnTracking) {
            dispatch({ type: 'nextTurn', playerId, ...loadTurnSettings() });
          }
          break;
        case 'v':
          if (!e.shiftKey) opts.onLibraryDialog('search');
          else if (current.libraryCount > 0) opts.onLibraryDialog('look');
          break;
        case 'r':
          opts.onRestart();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listen]);
};
