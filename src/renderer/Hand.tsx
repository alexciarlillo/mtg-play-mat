import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import classNames from 'classnames';
import { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import Draggable from 'react-draggable';
import 'tailwindcss/tailwind.css';
import icon from '../../assets/icon.svg';

const Card = ({ scryfallId }) => {
  const [imageUri, setImageUri] = useState(null);

  useEffect(() => {
    // fetch(`https://api.scryfall.com/cards/${scryfallId}`)
    //   .then((response) => response.json())
    //   .then((data) => setCardData(data))
    //   .catch((err) => console.error('scryfall API error', err.message));
    setImageUri(
      `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
        0
      )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
    );
  }, [scryfallId]);

  return (
    <div>
      <div className={classNames('aspect-card', 'w-52', 'origin-center')}>
        {imageUri ? (
          <img className="rounded-lg" src={imageUri} draggable={false} alt="" />
        ) : null}
      </div>
    </div>
  );
};

const Hand = () => {
  return (
    <div className="h-screen w-screen bg-slate-800">
      <div
        className="w-screen h-6 text-center bg-slate-200 text-center"
        style={{ '-webkit-app-region': 'drag' }}
      >
        Hand
      </div>
      <Card scryfallId="e8815cd9-7032-445a-aebc-cfc19bd51ee4" />
    </div>
  );
};

export default function App() {
  return <Hand />;
}
