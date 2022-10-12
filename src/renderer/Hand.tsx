import PropTypes from 'prop-types';
import { observer } from 'mobx-react';
import Card from './Card';
import { useHandStore } from './HandStore';
import 'tailwindcss/tailwind.css';

const Hand = () => {
  const hand = useHandStore();

  handlePlayed = (id) => {
    hand.play(id);
  };

  return (
    <div className="h-screen w-screen bg-slate-800">
      <div
        className="w-screen h-6 text-center bg-slate-200 text-center"
        style={{ WebkitAppRegion: 'drag' }}
      >
        Hand
      </div>
      {hand.cards.map((id) => (
        <Card key={id} scryfallId={id} playable onPlayed={handlePlayed} />
      ))}
    </div>
  );
};

export default observer(Hand);
