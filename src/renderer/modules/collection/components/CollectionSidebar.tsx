import { Combobox, Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline';
import { CurrentSetListReturn } from 'main/shared/db/CardDB.d';
import { observer } from 'mobx-react';
import React, {
  Fragment,
  ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRootStore } from 'renderer/core/rootContext';

const CollectionSidebar = (): ReactElement => {
  const [searchKey, setSearchKey] = useState('');
  const { collectionStore } = useRootStore();
  const [selectedSet, setSelectedSet] = useState<CurrentSetListReturn>();
  const [query, setQuery] = useState('');

  useEffect(() => {
    collectionStore.getSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (): void => {
    if (searchKey || selectedSet) {
      collectionStore.findCard({
        keyword: searchKey,
        setCode: selectedSet?.code,
      });
    }
  };

  const filteredSets = useMemo(() => {
    if (query === '' || collectionStore.sets === undefined) {
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
        className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
        onChange={(e) => {
          setSearchKey(e.target.value);
        }}
      />
      {collectionStore.sets && (
        <div className="w-full py-4">
          <Combobox value={selectedSet} onChange={setSelectedSet}>
            <div className="relative mt-1">
              <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
                <Combobox.Input
                  className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0"
                  displayValue={(set: CurrentSetListReturn) => set?.name}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon
                    className="h-5 w-5 text-gray-400"
                    aria-hidden="true"
                  />
                </Combobox.Button>
              </div>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                afterLeave={() => setQuery('')}
              >
                <Combobox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {filteredSets.length === 0 && query !== '' ? (
                    <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                      Nothing found.
                    </div>
                  ) : (
                    filteredSets.map((set) => (
                      <Combobox.Option
                        key={set.code}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-10 pr-4 ${
                            active ? 'bg-teal-600 text-white' : 'text-gray-900'
                          }`
                        }
                        value={set}
                      >
                        {({ selected, active }) => (
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
                                  active ? 'text-white' : 'text-teal-600'
                                }`}
                              >
                                <CheckIcon
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </span>
                            ) : null}
                          </>
                        )}
                      </Combobox.Option>
                    ))
                  )}
                </Combobox.Options>
              </Transition>
            </div>
          </Combobox>
        </div>
      )}
    </div>
  );
};

export default observer(CollectionSidebar);
