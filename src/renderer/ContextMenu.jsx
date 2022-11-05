import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';
import { useContextMenu } from './ContextMenuProvider';

const Menu = () => {
  const menu = useContextMenu();

  close = () => {
    menu.close();
  };

  return menu.isOpen ? (
    <div className="absolute" style={{ top: menu.posY, left: menu.posX }}>
      <ul className="w-full h-full bg-slate-200" onClick={close}>
        <li>Test 1</li>
        <li>Test 2</li>
        <li>Test 3</li>
      </ul>
    </div>
  ) : (
    <></>
  );
};

export default observer(Menu);
