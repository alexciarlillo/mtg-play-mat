import type CardModel from '@shared/models/CardModel';
import { observer } from 'mobx-react-lite';

import Card from '../../../ui/Card';
import { useHandStore } from './HandStoreContext';

const Hand = () => {
  const hand = useHandStore();

  const handlePlayed = (card: CardModel) => {
    hand.play(card);
  };

  return (
    <div className="h-full w-screen bg-slate-800">
      <div className="w-screen h-6 text-center bg-slate-200 [-webkit-app-region:drag]">
        Hand
      </div>
      <div className="grid grid-cols-7 gap-y-2">
        {hand.cards.map((card) => (
          <Card
            key={card.key}
            card={card}
            playable
            onPlayed={handlePlayed}
            draggable={false}
            location="hand"
          />
        ))}
      </div>
    </div>
  );
};

export default observer(Hand);
