import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { fieldScale } from './layout';

interface Box {
  width: number;
  height: number;
}

// Fills its parent and lays children out in logical battlefield units,
// scaled down to fit when the space is shorter than a full field.
const ScaledField = ({
  testId,
  children,
}: {
  testId: string;
  children(scale: number): ReactNode;
}) => {
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = box ? fieldScale(box.height) : 1;

  return (
    <div ref={outer} className="relative h-full w-full">
      <div
        data-testid={testId}
        data-scale={scale}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: box ? box.width / scale : '100%',
          height: box ? box.height / scale : '100%',
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      >
        {children(scale)}
      </div>
    </div>
  );
};

export default ScaledField;
