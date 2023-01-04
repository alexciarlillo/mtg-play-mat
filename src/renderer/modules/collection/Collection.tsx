import 'tailwindcss/tailwind.css';

import { useEffect, useState } from 'react';

import { useCollectionStore } from './CollectionStore';

const Collection = () => {
  const store = useCollectionStore();
  const [searchKey, setSearchKey] = useState('');
  const handleSearch = () => {
    if (searchKey) {
      store.findCard({ keyword: searchKey });
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
            className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            onChange={(e) => {
              setSearchKey(e.target.value);
            }}
          />
          3
          <button type="button" onClick={handleSearch}>
            search
          </button>
        </div>
        <div>2</div>
      </div>
      <div className="column-1">
        {store?.searchResults?.map((result, i) => {
          return <div key={i}>{result.name}</div>;
        })}
      </div>
    </div>
  );
};

export default Collection;
