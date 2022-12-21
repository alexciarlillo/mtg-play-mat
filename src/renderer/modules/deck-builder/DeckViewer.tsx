import { useDeckStore } from 'DeckStore';
import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';

const DeckViewer = () => {
  const store = useDeckStore();

  playTest = () => {
    window.PlayTest.load({ deckId: 1 });
  };

  return (
    <div className="w-full h-full">
      <button onClick={playTest}>Play Test</button>
    </div>
  );
};

export default observer(DeckViewer);
