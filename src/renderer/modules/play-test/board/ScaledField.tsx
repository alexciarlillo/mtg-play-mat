import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { fieldScale } from './layout';

interface Box {
  width: number;
  height: number;
}

// Fills its parent and lays children out in logical battlefield units,
// scaled to the space's height, and down to fit when it is narrower than
// fitWidth logical units. offsetX shifts the contents right, for fields
// whose leftmost card overhangs its own position. backdrop fills the
// whole space, unscaled, behind everything.
const ScaledField = ({
  testId,
  fitWidth,
  offsetX = 0,
  backdrop,
  children,
}: {
  testId: string;
  fitWidth?: number;
  offsetX?: number;
  backdrop?: ReactNode;
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

  const scale = box
    ? Math.min(
        fieldScale(box.height),
        fitWidth && box.width > 0 ? box.width / fitWidth : Infinity
      )
    : 1;

  return (
    <div ref={outer} className="relative h-full w-full">
      {backdrop}
      <div
        data-testid={testId}
        data-scale={scale}
        data-offset-x={offsetX}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: box ? box.width / scale : '100%',
          height: box ? box.height / scale : '100%',
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: offsetX === 0 ? undefined : `translateX(${offsetX}px)`,
          }}
        >
          {children(scale)}
        </div>
      </div>
    </div>
  );
};

export default ScaledField;
