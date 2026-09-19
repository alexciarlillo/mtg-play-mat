import { observer } from 'mobx-react-lite';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useContextMenu } from './ContextMenuProvider';

const MARGIN = 4;

const ContextMenu = () => {
  const contextMenu = useContextMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const closeMenu = () => {
      contextMenu.close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };

    document.body.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeMenu);

    return function cleanup() {
      document.body.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  // Small windows (the hand) would otherwise clip a long menu, so shift it
  // back inside the viewport once its size is known.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!contextMenu.isOpen || !menu) return;
    const right = window.scrollX + window.innerWidth - MARGIN;
    const bottom = window.scrollY + window.innerHeight - MARGIN;
    setOffset({
      x: Math.min(0, right - (contextMenu.posX + menu.offsetWidth)),
      y: Math.min(0, bottom - (contextMenu.posY + menu.offsetHeight)),
    });
  }, [
    contextMenu.isOpen,
    contextMenu.posX,
    contextMenu.posY,
    contextMenu.specs,
  ]);

  if (!contextMenu.isOpen) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute z-50 min-w-44 rounded-md shadow-lg ring-1 ring-black/5 bg-stone-100 py-1"
      style={{
        top: Math.max(MARGIN, contextMenu.posY + offset.y),
        left: Math.max(MARGIN, contextMenu.posX + offset.x),
      }}
    >
      {contextMenu.specs.map((spec) => (
        <button
          type="button"
          role="menuitem"
          className="text-gray-700 block px-3 py-0.5 text-sm text-left whitespace-nowrap hover:bg-stone-300 disabled:text-gray-400 disabled:hover:bg-transparent w-full"
          disabled={!spec.action}
          onClick={spec.action ?? undefined}
          key={spec.title}
        >
          {spec.title}
        </button>
      ))}
    </div>
  );
};

export default observer(ContextMenu);
