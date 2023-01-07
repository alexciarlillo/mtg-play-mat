/* eslint-disable jsx-a11y/interactive-supports-focus */
/* eslint-disable react/no-array-index-key */
import 'tailwindcss/tailwind.css';

import classNames from 'classnames';
import { observer } from 'mobx-react';
import { useEffect, useMemo, useState } from 'react';
import { useRootStore } from 'renderer/core/rootContext';
import useDimensions from 'renderer/hooks/useDimensions';
import useKeyPress from 'renderer/hooks/useKeyPress';
import CardImg from 'renderer/ui/CardImg';

const cardWidth = 192;

const Collection = () => {
  const { collectionStore } = useRootStore();
  const [searchKey, setSearchKey] = useState('');
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

  const handleSearch = () => {
    if (searchKey) {
      collectionStore.findCard({ keyword: searchKey });
    }
  };

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
    <div className="w-full h-full flex ">
      <div className=" bg-red-300 h-full w-72 p-4">
        <input
          id="name"
          name="name"
          type="text"
          required
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
          className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          onChange={(e) => {
            setSearchKey(e.target.value);
          }}
        />
      </div>
      <div
        className="w-full flex flex-wrap justify-center bg-gray-500"
        ref={ref}
      >
        {collectionStore?.searchResults?.map((result, i) => {
          return (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              role="button"
              className={classNames(
                'w-44 aspect-card m-2 p-4',
                i === selectedIndex && 'bg-gray-300'
              )}
              key={i}
              onClick={(): void => {
                setSelectedIndex(i);
              }}
            >
              <CardImg
                className="hover:ring hover:ring-indigo-400"
                key={i}
                scryfallId={result.scryfallId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default observer(Collection);
