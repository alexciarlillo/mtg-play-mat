import type { PlayerId } from '@shared/game';
import { matImageUrl } from '@shared/mat';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { cardBackUrl } from './cardImages';

// Each card is drawn with its owner's back, as sleeves are at a real
// table; anyone without one of their own gets the standard back.
type BackOf = (owner?: PlayerId) => string;

const CardBackContext = createContext<BackOf>(() => cardBackUrl);

export const CardBackProvider = ({
  backs,
  children,
}: {
  // Each player's back, by the id the mat store names it with.
  backs: Record<PlayerId, string | null | undefined>;
  children: ReactNode;
}) => {
  const key = JSON.stringify(backs);
  const backOf = useMemo<BackOf>(() => {
    const byOwner = JSON.parse(key) as Record<PlayerId, string | null>;
    return (owner) => {
      const id = owner ? byOwner[owner] : null;
      return id ? matImageUrl(id) : cardBackUrl;
    };
  }, [key]);
  return (
    <CardBackContext.Provider value={backOf}>
      {children}
    </CardBackContext.Provider>
  );
};

export const useCardBack = (owner?: PlayerId): string =>
  useContext(CardBackContext)(owner);
