import React, { ReactElement, useState } from 'react';
import { useRootStore } from 'renderer/core/rootContext';

const CollectionSidebar = (): ReactElement => {
  const [searchKey, setSearchKey] = useState('');
  const { collectionStore } = useRootStore();

  const handleSearch = (): void => {
    if (searchKey) {
      collectionStore.findCard({ keyword: searchKey });
    }
  };

  return (
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
  );
};

export default CollectionSidebar;
