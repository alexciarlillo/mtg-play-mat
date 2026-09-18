import { observer } from 'mobx-react-lite';

import Card from '../../../ui/Card';
import { useBoardStore } from './BoardStoreContext';

const Graveyard = () => {
  const board = useBoardStore();

  return (
    <div className="flex flex-col justify-evenly relative">
      {board.graveyard.map((card, index) => (
        <div
          style={{ position: 'absolute', top: `${index * 30}px` }}
          key={card.key}
        >
          <Card
            card={card}
            draggable={false}
            tappable={false}
            location="graveyard"
          />
        </div>
      ))}
    </div>
  );
};

export default observer(Graveyard);
