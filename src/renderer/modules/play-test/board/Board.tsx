import { useEffect } from 'react';
import { observer } from 'mobx-react';
import Library from 'Library';
import Graveyard from 'Graveyard';
import Card from 'Card';
import { useBoardStore } from 'BoardStore';
import { useContextMenu } from 'ContextMenuProvider';
import 'tailwindcss/tailwind.css';

const Board = () => {
  const board = useBoardStore();
  const menu = useContextMenu();

  handleMoved = (id) => {
    board.moved(id);
  };

  handleDestroyed = (id) => {
    board.destroy(id);
  };

  handleContextMenu = (e) => {
    e.preventDefault();
    console.log('board menu', e);
    menu.open({
      specs: [{ title: 'Add Token', action: null }],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div
      className="h-screen w-screen bg-slate-300 relative flex"
      onContextMenu={handleContextMenu}
    >
      <div className="w-4/5 h-full bg-neutral-400">
        {board.battlefield.map((id) => (
          <Card
            scryfallId={id}
            key={id}
            onMoved={handleMoved}
            onDestroy={handleDestroyed}
          />
        ))}
      </div>
      <div className="w-1/5 h-full">
        <div className="h-1/2 bg-zinc-300">
          <Library />
        </div>
        <div className="h-1/2 bg-slate-800">
          <Graveyard />
        </div>
      </div>
    </div>
  );
};

export default observer(Board);
