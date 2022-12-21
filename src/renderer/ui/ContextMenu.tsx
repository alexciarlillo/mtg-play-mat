import { useEffect, Fragment } from 'react';
import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';
import classNames from 'classnames';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useContextMenu } from 'ContextMenuProvider';

const ContextMenu = () => {
  const contextMenu = useContextMenu();

  useEffect(() => {
    const closeMenu = () => {
      contextMenu.close();
    };

    document.body.addEventListener('click', closeMenu);

    return function cleanup() {
      window.removeEventListener('click', closeMenu);
    };
  }, [contextMenu]);

  return contextMenu.isOpen ? (
    <div
      className="absolute"
      style={{ top: contextMenu.posY, left: contextMenu.posX }}
    >
      <div as="div" className="relative inline-block text-left">
        <div className="absolute right-0 z-10 mt-2 w-24 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none bg-stone-100 py-1">
          {contextMenu.specs.map((spec) => (
            <button
              className="text-gray-700 block px-2 py-0.5 text-sm  hover:bg-stone-300 w-full"
              onClick={spec.action}
              key={spec.title}
            >
              {spec.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : (
    <></>
  );
};

export default observer(ContextMenu);
