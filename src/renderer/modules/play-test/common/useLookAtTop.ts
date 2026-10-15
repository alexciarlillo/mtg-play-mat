import { useEffect, useState } from 'react';

// Whether the player always looks at their top card, as main has it.
export const useLookAtTop = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    const off = window.api.onLookAtTop(setOn);
    window.api.getLookAtTop().then(
      (value) => {
        if (live) setOn(value);
      },
      (err: unknown) => {
        console.error('[play-test] failed to read look at top', err);
      }
    );
    return () => {
      live = false;
      off();
    };
  }, []);
  return on;
};

export const setLookAtTop = (on: boolean) => {
  window.api.setLookAtTop(on).catch((err: unknown) => {
    console.error('[play-test] failed to change look at top', err);
  });
};
