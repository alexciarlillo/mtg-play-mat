import { observer } from 'mobx-react-lite';
import { ReactElement, useEffect, useMemo, useState } from 'react';

import { useRootStore } from '../../../core/rootContext';
import useDimensions from '../../../hooks/useDimensions';

import CollectionCardWrapper from './CollectionCardWrapper';

const cardWidth = 192;

const CollectionMain = (): ReactElement => {
  const { collectionStore } = useRootStore();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const {
    ref,
    dimensions: { width },
    measure,
  } = useDimensions();

  const cardsPerRow = useMemo(() => {
    return Math.floor(width / cardWidth);
  }, [width]);

  useEffect(() => {
    measure();
  }, [collectionStore.searchResults.length, measure]);

  const resultCount = collectionStore.searchResults.length;

  useEffect(() => {
    const lastIndex = Math.max(resultCount - 1, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
          setSelectedIndex((prev) => Math.min(prev + 1, lastIndex));
          break;
        case 'ArrowLeft':
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'ArrowUp':
          setSelectedIndex((prev) => Math.max(prev - cardsPerRow, 0));
          break;
        case 'ArrowDown':
          setSelectedIndex((prev) => Math.min(prev + cardsPerRow, lastIndex));
          break;
        default:
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resultCount, cardsPerRow]);

  return (
    <div className="h-full w-full">
      <div className="w-full flex flex-wrap justify-center" ref={ref}>
        {collectionStore?.searchResults?.map((result, i) => {
          return (
            <CollectionCardWrapper
              card={result}
              selected={i === selectedIndex}
              key={result.id}
              setSelected={(): void => {
                setSelectedIndex(i);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default observer(CollectionMain);
