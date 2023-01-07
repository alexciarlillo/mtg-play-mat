/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/no-shadow */
import { SetStateAction, useCallback, useLayoutEffect, useState } from 'react';

import {
  DimensionObject,
  UseDimensionsArgs,
  UseDimensionsHook,
} from './useDimensions.d';

function getDimensionObject(node: HTMLDivElement | undefined): DimensionObject {
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

  const ref = useCallback((node: SetStateAction<HTMLDivElement | null>) => {
    setNode(node);
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
  }, [node, liveMeasure, dimensions, measure]);

  return { ref, dimensions, measure };
}

export default useDimensions;
