import { observer } from 'mobx-react';
import Card from 'Card';
import { useHandStore } from 'HandStore';
import 'tailwindcss/tailwind.css';

const Hand = () => {
  const hand = useHandStore();

  handlePlayed = (card) => {
    hand.play(card);
  };

  return (
    <div className="h-full w-screen bg-slate-800">
      <div
        className="w-screen h-6 text-center bg-slate-200 text-center"
        style={{ WebkitAppRegion: 'drag' }}
      >
        Hand
      </div>
      <div className="grid grid-cols-7 gap-y-2">
        {hand.cards.map((card, index) => (
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
