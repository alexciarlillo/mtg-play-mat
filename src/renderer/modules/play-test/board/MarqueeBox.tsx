import { useSyncExternalStore } from 'react';

import type { BoxStore } from './useMarquee';

// The box a marquee drag draws, in window coordinates.
const MarqueeBox = ({ store }: { store: BoxStore }) => {
  const box = useSyncExternalStore(store.subscribe, () => store.box);
  if (!box) return null;
  return (
    <div
      data-testid="selection-box"
      className="pointer-events-none fixed z-30 border-2 border-sky-400 bg-sky-400/15"
      style={box}
    />
  );
};

export default MarqueeBox;
