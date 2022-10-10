import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import classNames from 'classnames';
import { useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import Draggable from 'react-draggable';
import 'tailwindcss/tailwind.css';
import icon from '../../assets/icon.svg';

const Card = ({ scryfallId }) => {
  const [tapped, setTapped] = useState(false);
  const [moved, setMoved] = useState(false);
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

  toggleTapped = () => {
    if (!moved) {
      setTapped(!tapped);
    }

    setMoved(false);
  };

  return (
    <Draggable
      onDrag={(args, data) => {
        setMoved(true);
      }}
    >
      <div onClick={toggleTapped}>
        <div
          className={classNames('aspect-card', 'w-52', 'origin-center', {
            'rotate-90': tapped,
          })}
        >
          {imageUri ? (
            <img
              className="rounded-lg"
              src={imageUri}
              draggable={false}
              alt=""
            />
          ) : null}
        </div>
      </div>
    </Draggable>
  );
};

const Board = () => {
  return (
    <div className="h-screen w-screen bg-slate-300">
      <Card scryfallId="e8815cd9-7032-445a-aebc-cfc19bd51ee4" />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Board />} />
      </Routes>
    </Router>
  );
}
