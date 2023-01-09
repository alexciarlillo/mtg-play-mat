import { observer } from 'mobx-react';
import React, { ReactElement, useEffect, useMemo, useState } from 'react';
import { useRootStore } from 'renderer/core/rootContext';
import useDimensions from 'renderer/hooks/useDimensions';
import useKeyPress from 'renderer/hooks/useKeyPress';

import CollectionCardWrapper from './CollectionCardWrapper';

const cardWidth = 192;

const CollectionMain = (): ReactElement => {
  const { collectionStore } = useRootStore();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const leftPress = useKeyPress('ArrowLeft');
  const rightPress = useKeyPress('ArrowRight');
  const upPress = useKeyPress('ArrowUp');
  const downPress = useKeyPress('ArrowDown');

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

  useEffect(() => {
    if (rightPress) {
      setSelectedIndex((prevState) =>
        prevState < collectionStore.searchResults.length - 1
          ? prevState + 1
          : prevState
      );
    }
  }, [collectionStore.searchResults.length, rightPress]);

  useEffect(() => {
    if (leftPress) {
      setSelectedIndex((prevState) =>
        prevState > 0 ? prevState - 1 : prevState
      );
    }
  }, [collectionStore.searchResults.length, leftPress]);

  useEffect(() => {
    if (upPress) {
      setSelectedIndex((prevState) => {
        const newUpdatedValue = prevState - cardsPerRow;
        return newUpdatedValue >= 0 ? newUpdatedValue : 0;
      });
    }
  }, [collectionStore.searchResults.length, upPress, cardsPerRow]);

  useEffect(() => {
    if (downPress) {
      setSelectedIndex((prevState) => {
        const newUpdatedValue = prevState + cardsPerRow;
        return newUpdatedValue;
      });
    }
  }, [collectionStore.searchResults.length, downPress, cardsPerRow]);

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
