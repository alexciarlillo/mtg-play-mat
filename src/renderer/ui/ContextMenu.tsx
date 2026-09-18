import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';

import { useContextMenu } from './ContextMenuProvider';

const ContextMenu = () => {
  const contextMenu = useContextMenu();

  useEffect(() => {
    const closeMenu = () => {
      contextMenu.close();
    };

    document.body.addEventListener('click', closeMenu);

    return function cleanup() {
      document.body.removeEventListener('click', closeMenu);
    };
  }, [contextMenu]);

  if (!contextMenu.isOpen) return null;

  return (
    <div
      className="absolute"
      style={{ top: contextMenu.posY, left: contextMenu.posX }}
    >
      <div className="relative inline-block text-left">
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-24 origin-top-right rounded-md shadow-lg ring-1 ring-black/5 focus:outline-hidden bg-stone-100 py-1"
        >
          {contextMenu.specs.map((spec) => (
            <button
              type="button"
              role="menuitem"
              className="text-gray-700 block px-2 py-0.5 text-sm  hover:bg-stone-300 w-full"
              onClick={spec.action ?? undefined}
              key={spec.title}
            >
              {spec.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default observer(ContextMenu);
