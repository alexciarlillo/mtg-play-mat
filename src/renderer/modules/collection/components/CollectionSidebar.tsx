import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline';
import { CurrentSetListReturn } from '@shared/types/cards';
import { observer } from 'mobx-react-lite';
import { ReactElement, useEffect, useMemo, useState } from 'react';

import { useRootStore } from '../../../core/rootContext';

const CollectionSidebar = (): ReactElement => {
  const [searchKey, setSearchKey] = useState('');
  const { collectionStore } = useRootStore();
  const [selectedSet, setSelectedSet] = useState<CurrentSetListReturn | null>(
    null
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    collectionStore.getSets();
  }, [collectionStore]);

  const handleSearch = (): void => {
    if (searchKey || selectedSet) {
      collectionStore.findCard({
        keyword: searchKey,
        setCode: selectedSet?.code,
      });
    }
  };

  const filteredSets = useMemo(() => {
    if (query === '') {
      return collectionStore.sets;
    }
    return collectionStore.sets.filter((set) => {
      return set.name
        .toLowerCase()
        .replace(/\s+/g, '')
        .includes(query.toLowerCase().replace(/\s+/g, ''));
    });
  }, [collectionStore.sets, query]);

  return (
    <div className=" bg-red-300 h-full w-72 p-4">
      <input
        id="name"
        name="name"
        type="text"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSearch();
          }
        }}
        className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-400 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-indigo-500 sm:text-sm"
        onChange={(e) => {
          setSearchKey(e.target.value);
        }}
      />
      <div className="w-full py-4">
        <Combobox
          value={selectedSet}
          onChange={setSelectedSet}
          onClose={() => setQuery('')}
        >
          <div className="relative mt-1">
            <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
              <ComboboxInput
                className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0"
                displayValue={(set: CurrentSetListReturn | null) =>
                  set?.name ?? ''
                }
                onChange={(event) => setQuery(event.target.value)}
              />
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>
            <ComboboxOptions
              transition
              className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden sm:text-sm transition ease-in duration-100 data-leave:data-closed:opacity-0"
            >
              {filteredSets.length === 0 && query !== '' ? (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                  Nothing found.
                </div>
              ) : (
                filteredSets.map((set) => (
                  <ComboboxOption
                    key={set.code}
                    className={({ focus }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        focus ? 'bg-teal-600 text-white' : 'text-gray-900'
                      }`
                    }
                    value={set}
                  >
                    {({ selected, focus }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? 'font-medium' : 'font-normal'
                          }`}
                        >
                          {set.name}
                        </span>
                        {selected ? (
                          <span
                            className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                              focus ? 'text-white' : 'text-teal-600'
                            }`}
                          >
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </div>
        </Combobox>
      </div>
    </div>
  );
};

export default observer(CollectionSidebar);
