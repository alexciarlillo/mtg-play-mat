import { useParams } from 'react-router-dom';
import { observer } from 'mobx-react';
import 'tailwindcss/tailwind.css';

const DeckViewer = () => {
  const { deckId } = useParams();

  playTest = () => {
    window.PlayTest.load({ deckId });
  };

  console.log({ deckId });
  return (
    <div className="w-full h-full">
      <button onClick={playTest}>Play Test</button>
    </div>
  );
};

export default observer(DeckViewer);
