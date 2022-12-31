import 'tailwindcss/tailwind.css';

import { Disclosure } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { ContextMenuProvider } from 'ContextMenuProvider';
import DeckStore, { DeckStoreProvider } from 'DeckStore';
import { Fragment } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import CollectionStore, {
  CollectionStoreProvider,
} from './modules/collection/CollectionStore';

const modules = [
  { label: 'Deck Builder', route: 'decks' },
  { label: 'Collection', route: 'collection' },
];

const deckStore = new DeckStore();
const collectionStore = new CollectionStore();

const Start = () => {
  return (
    <ContextMenuProvider>
      <DeckStoreProvider store={deckStore}>
        <CollectionStoreProvider store={collectionStore}>
          <div className="min-h-full flex flex-col">
            <div className="bg-gray-800 pb-32 flex-0">
              <Disclosure as="nav" className="bg-gray-800">
                {({ open }) => (
                  <>
                    <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                      <div className="border-b border-gray-700">
                        <div className="flex h-16 items-center justify-between px-4 sm:px-0">
                          <div className="flex items-center">
                            <div className="hidden md:block">
                              <div className="flex items-baseline space-x-4">
                                {modules.map((module) => (
                                  <NavLink
                                    key={module.label}
                                    to={module.route}
                                    className={({ isActive }) =>
                                      isActive
                                        ? 'block px-3 py-2 rounded-md text-base font-medium bg-gray-900 text-white'
                                        : 'block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }
                                  >
                                    {module.label}
                                  </NavLink>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="-mr-2 flex md:hidden">
                            {/* Mobile menu button */}
                            <Disclosure.Button className="inline-flex items-center justify-center rounded-md bg-gray-800 p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                              <span className="sr-only">Open main menu</span>
                              {open ? (
                                <XMarkIcon
                                  className="block h-6 w-6"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Bars3Icon
                                  className="block h-6 w-6"
                                  aria-hidden="true"
                                />
                              )}
                            </Disclosure.Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Disclosure.Panel className="border-b border-gray-700 md:hidden">
                      <div className="space-y-1 px-2 py-3 sm:px-3">
                        {modules.map((module) => (
                          <Disclosure.Button
                            key={module.label}
                            as="NavLink"
                            to={module.route}
                            className={({ isActive }) =>
                              isActive
                                ? 'block px-3 py-2 rounded-md text-base font-medium bg-gray-900 text-white'
                                : 'block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white'
                            }
                          >
                            {module.label}
                          </Disclosure.Button>
                        ))}
                      </div>
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
            </div>

            <main className="-mt-32 flex-1 flex">
              <div className="mx-auto px-4 pb-12 sm:px-6 lg:px-8 flex-1">
                <div className="rounded-lg bg-white px-5 py-6 shadow sm:px-6 h-full">
                  <Outlet />
                </div>
              </div>
            </main>
          </div>
        </CollectionStoreProvider>
      </DeckStoreProvider>
    </ContextMenuProvider>
  );
};

export default Start;
