import type { CardDataStatus } from '@shared/types/cardData';
import { useEffect, useState } from 'react';

// Current card data status, kept live by main's cardDataStatus pushes.
const useCardDataStatus = (): CardDataStatus | null => {
  const [status, setStatus] = useState<CardDataStatus | null>(null);

  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.api.onCardDataStatus((next) => {
      pushed = true;
      setStatus(next);
    });
    // A push that lands first is newer than this snapshot.
    void window.api.getCardDataStatus().then((initial) => {
      if (!pushed) setStatus(initial);
    });
    return unsubscribe;
  }, []);

  return status;
};

export default useCardDataStatus;
