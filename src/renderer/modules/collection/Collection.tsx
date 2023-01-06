/* eslint-disable react/no-array-index-key */
import 'tailwindcss/tailwind.css';

import { observer } from 'mobx-react';
import { useState } from 'react';
import { useRootStore } from 'renderer/core/rootContext';
import CardImg from 'renderer/ui/CardImg';

const Collection = () => {
  const { collectionStore } = useRootStore();
  const [searchKey, setSearchKey] = useState('');
  const handleSearch = () => {
    if (searchKey) {
      collectionStore.findCard({ keyword: searchKey });
    }
  };

  return (
    <div className="w-full h-full">
      <div className="columns-2">
        <div className="max-w-xs">
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
          <button type="button" onClick={handleSearch}>
            search
          </button>
        </div>
      </div>
      <div className="w-full grid grid-cols-4">
        {collectionStore?.searchResults?.map((result, i) => {
          return (
            <div className="w-52 aspect-card" key={i}>
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
