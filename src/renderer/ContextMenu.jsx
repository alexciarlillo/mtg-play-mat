import { useEffect } from 'react';
import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';
import { useContextMenu } from './ContextMenuProvider';

const Menu = () => {
  const menu = useContextMenu();

  useEffect(() => {
    const closeMenu = () => {
      menu.close();
    };

    document.body.addEventListener('click', closeMenu);

    return function cleanup() {
      window.removeEventListener('click', closeMenu);
    };
  }, [menu]);

  return menu.isOpen ? (
    <div className="absolute" style={{ top: menu.posY, left: menu.posX }}>
      <ul className="w-full h-full bg-slate-200">
        {menu.specs.map(({ title, action }, i) => {
          return (
            <li key={i} onClick={action}>
              {title}
            </li>
          );
        })}
      </ul>
    </div>
  ) : (
    <></>
  );
};

export default observer(Menu);
