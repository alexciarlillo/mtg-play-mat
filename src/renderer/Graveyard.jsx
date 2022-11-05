import { observer } from 'mobx-react';
import Card from './Card';
import { useBoardStore } from './BoardStore';
import 'tailwindcss/tailwind.css';

const Graveyard = () => {
  const board = useBoardStore();

  return (
    <div className="flex flex-col justify-evenly">
      {board.graveyard.length > 0 && (
        <Card
          key={board.graveyard[0]}
          scryfallId={board.graveyard[0]}
          draggable={false}
          tappable={false}
        />
      )}
    </div>
  );
};

export default observer(Graveyard);
