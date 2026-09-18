import type { CardView } from '@shared/game';
import { useEffect, useState } from 'react';

const logError = (err: unknown) => {
  console.error('[play-test] failed to load the library', err);
};

// The library, top first, fetched on demand because it is never pushed.
// It is fetched again whenever the game moves on (a new view seq).
export const useLibrary = (seq: number): CardView[] | null => {
  const [cards, setCards] = useState<CardView[] | null>(null);
  useEffect(() => {
    let live = true;
    window.api.getLibrary().then((next) => {
      if (live) setCards(next);
    }, logError);
    return () => {
      live = false;
    };
  }, [seq]);
  return cards;
};
