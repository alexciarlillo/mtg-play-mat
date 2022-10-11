import PropTypes from 'prop-types';
import { observer } from 'mobx-react';
import Card from './Card';
import 'tailwindcss/tailwind.css';

const Hand = ({ store }) => {
  handlePlayed = (id) => {
    store.play(id);
  };

  return (
    <div className="h-screen w-screen bg-slate-800">
      <div
        className="w-screen h-6 text-center bg-slate-200 text-center"
        style={{ WebkitAppRegion: 'drag' }}
      >
        Hand
      </div>
      {store.hand.map((id) => (
        <Card scryfallId={id} playable onPlayed={handlePlayed} />
      ))}
    </div>
  );
};

Hand.propTypes = {
  store: PropTypes.object,
};

Hand.defaultProps = {
  store: {},
};

export default observer(Hand);
