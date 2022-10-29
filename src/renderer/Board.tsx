import { observer } from 'mobx-react';
import Library from './Library';
import Graveyard from './Graveyard';
import Card from './Card';
import { useBoardStore } from './BoardStore';
import 'tailwindcss/tailwind.css';

const Board = () => {
  const board = useBoardStore();

  handleMoved = (id) => {
    board.moved(id);
  };

  return (
    <div className="h-screen w-screen bg-slate-300 relative flex">
      <div className="w-4/5 h-full bg-neutral-400">
        {board.battlefield.map((id) => (
          <Card scryfallId={id} key={id} onMoved={handleMoved} />
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
