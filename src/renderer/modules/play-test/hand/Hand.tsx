import { observer } from 'mobx-react';
import Card from 'Card';
import { useHandStore } from 'HandStore';
import 'tailwindcss/tailwind.css';

const Hand = () => {
  const hand = useHandStore();

  handlePlayed = (id) => {
    hand.play(id);
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
        {hand.cards.map((id) => (
          <Card
            key={id}
            scryfallId={id}
            playable
            onPlayed={handlePlayed}
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
};

export default observer(Hand);
