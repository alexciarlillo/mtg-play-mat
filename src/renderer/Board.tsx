import { observer } from 'mobx-react';
import Card from './Card';
import { useBoardStore } from './BoardStore';
import 'tailwindcss/tailwind.css';

const Board = () => {
  const board = useBoardStore();
  return (
    <div className="h-screen w-screen bg-slate-300 relative">
      {board.battlefield.map((id) => (
        <Card scryfallId={id} key={id} />
      ))}
    </div>
  );
};

export default observer(Board);
