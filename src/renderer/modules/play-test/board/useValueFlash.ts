import { useEffect, useRef, useState } from 'react';

// Which way a number just moved, for the short while after it moved.
export type Flash = 'up' | 'down' | null;

// Life changes arrive as a new view, with nothing to say they changed.
// This marks the change for a moment so the board can colour it: damage
// is easy to miss when the table log is folded away.
export const FLASH_MS = 1500;

const useValueFlash = (value: number | null, ms = FLASH_MS): Flash => {
  const previous = useRef(value);
  const [flash, setFlash] = useState<Flash>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    // Nothing to compare against on the first view, or when a player
    // leaves and comes back.
    if (before === null || value === null || value === before) return;
    setFlash(value < before ? 'down' : 'up');
    const timer = setTimeout(() => setFlash(null), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return flash;
};

export default useValueFlash;
