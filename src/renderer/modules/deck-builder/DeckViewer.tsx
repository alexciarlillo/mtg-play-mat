import { useParams } from 'react-router';

const DeckViewer = () => {
  const { deckId } = useParams();

  const playTest = () => {
    if (deckId) {
      window.PlayTest.load({ deckId });
    }
  };

  return (
    <div className="w-full h-full">
      <button type="button" onClick={playTest}>
        Play Test
      </button>
    </div>
  );
};

export default DeckViewer;
