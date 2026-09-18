import { useCallback, useLayoutEffect, useState } from 'react';

export interface DimensionObject {
  width: number;
  height: number;
}

export type UseDimensionsHook = {
  ref: (node: HTMLDivElement | null) => void;
  dimensions: DimensionObject;
  measure: () => void;
};

export interface UseDimensionsArgs {
  liveMeasure?: boolean;
}

function getDimensionObject(node: HTMLDivElement | null): DimensionObject {
  if (!node) {
    return {
      height: 0,
      width: 0,
    };
  }
  const rect = node.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}

function useDimensions({
  liveMeasure = true,
}: UseDimensionsArgs = {}): UseDimensionsHook {
  const [dimensions, setDimensions] = useState<DimensionObject>({
    height: 0,
    width: 0,
  });
  const [node, setNode] = useState<null | HTMLDivElement>(null);

  const ref = useCallback((newNode: HTMLDivElement | null) => {
    setNode(newNode);
  }, []);

  const measure = useCallback(() => {
    if (node && node !== null) {
      window.requestAnimationFrame(() => {
        const newDimensions = getDimensionObject(node);
        if (
          dimensions.width !== newDimensions.width ||
          dimensions.height !== newDimensions.height
        ) {
          setDimensions(newDimensions);
        }
      });
    }
  }, [node, dimensions]);

  useLayoutEffect(() => {
    if (node && node !== null) {
      measure();

      if (liveMeasure) {
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure);

        node.addEventListener('click', measure);

        return (): void => {
          window.removeEventListener('resize', measure);
          window.removeEventListener('scroll', measure);

          node.removeEventListener('click', measure);
        };
      }
    }
    return undefined;
  }, [node, liveMeasure, dimensions, measure]);

  return { ref, dimensions, measure };
}

export default useDimensions;
