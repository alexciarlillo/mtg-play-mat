import type CardModel from '@shared/models/CardModel';
import { observer } from 'mobx-react-lite';
import { MouseEvent } from 'react';

import Card from '../../../ui/Card';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { useBoardStore } from './BoardStoreContext';
import Graveyard from './Graveyard';
import Library from './Library';

const Board = () => {
  const board = useBoardStore();
  const menu = useContextMenu();

  const handleMoved = (card: CardModel) => {
    board.moved(card);
  };

  const handleDestroyed = (card: CardModel) => {
    board.destroy(card);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
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
      <div className="w-4/5 h-full bg-neutral-400 px-12 py-8">
        {board.battlefield.map((card) => (
          <Card
            card={card}
            key={card.key}
            onMoved={handleMoved}
            onDestroy={handleDestroyed}
            location="battlefield"
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
