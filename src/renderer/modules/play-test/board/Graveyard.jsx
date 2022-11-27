import { observer } from 'mobx-react';
import Card from 'Card';
import { useBoardStore } from 'BoardStore';
import 'tailwindcss/tailwind.css';

const Graveyard = () => {
  const board = useBoardStore();

  return (
    <div className="flex flex-col justify-evenly relative">
      {board.graveyard.map((card, index) => (
        <div
          style={{ position: 'absolute', top: `${index * 30}px` }}
          key={card}
        >
          <Card
            key={card}
            scryfallId={card}
            draggable={false}
            tappable={false}
          />
        </div>
      ))}
    </div>
  );
};

export default observer(Graveyard);
