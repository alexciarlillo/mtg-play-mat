/* eslint-disable react-hooks/exhaustive-deps */
import { RefObject, useEffect, useState } from 'react';

const useKeyPress = (targetKey: string, ref?: RefObject<HTMLElement>) => {
  const [keyPressed, setKeyPressed] = useState(false);

  function downHandler({ key }: { key: string }) {
    if (key === targetKey) {
      setKeyPressed(true);
    }
  }

  const upHandler = ({ key }: { key: string }) => {
    if (key === targetKey) {
      setKeyPressed(false);
    }
  };

  useEffect(() => {
    if (ref) {
      ref.current?.addEventListener('keydown', downHandler);
      ref.current?.addEventListener('keyup', upHandler);
    } else {
      window.addEventListener('keydown', downHandler);
      window.addEventListener('keyup', upHandler);
    }

    return () => {
      if (ref) {
        ref.current?.removeEventListener('keydown', downHandler);
        ref.current?.removeEventListener('keyup', upHandler);
      } else {
        window.removeEventListener('keydown', downHandler);
        window.removeEventListener('keyup', upHandler);
      }
    };
  });

  return keyPressed;
};

export default useKeyPress;
