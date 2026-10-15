import type { SavedGameOffer } from '@shared/types/playTest';
import { useEffect, useState } from 'react';

const logError = (err: unknown) => {
  console.error('[play-test] saved game request failed', err);
};

// Main reads the save as the game opens; this only mirrors its offer.
const useSavedGame = (): SavedGameOffer | null => {
  const [offer, setOffer] = useState<SavedGameOffer | null>(null);
  useEffect(() => {
    let fresh = true;
    const off = window.api.onSavedGame((next) => {
      fresh = false;
      setOffer(next);
    });
    window.api.getSavedGame().then((initial) => {
      if (fresh) setOffer(initial);
    }, logError);
    return off;
  }, []);
  return offer;
};

export default useSavedGame;
