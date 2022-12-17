import { Link } from 'react-router-dom';
import { observer } from 'mobx-react';
import CardImg from 'CardImg';
import { useDeckStore } from 'DeckStore';
import { useState, useEffect } from 'react';
import { useContextMenu } from 'ContextMenuProvider';
import DeckImportModal from 'DeckImportModal';
import { PlusIcon } from '@heroicons/react/24/outline';
import 'tailwindcss/tailwind.css';

const DeckBuilder = () => {
  const store = useDeckStore();
  const menu = useContextMenu();

  const [importingDeck, setImportingDeck] = useState(false);

  handleImport = ({ name, deckList }) => {
    store.addDeck({ name, deckList });
    setImportingDeck(false);
  };

  useEffect(() => {
    store.refreshDecks();
  }, []);

  deckMenu = (e, deck) => {
    e.preventDefault();
    menu.open({
      specs: [
        { title: 'Delete', action: () => store.deleteDeck({ id: deck.id }) },
      ],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div className="w-full h-full">
      <div className="w-full h-full grid grid-cols-3">
        <button
          type="button"
          className="relative block aspect-card w-52 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex flex-col items-center justify-center"
          onClick={() => setImportingDeck(true)}
        >
          <PlusIcon className="h-6 w-6" />
          <span className="mt-2 block text-sm font-medium text-gray-900">
            Add a new deck
          </span>
        </button>
        {store.decks.map((deck) => {
          return (
            <Link
              className="w-52"
              key={deck.id}
              onContextMenu={(e) => deckMenu(e, deck)}
              to={`/decks/${deck.id}`}
            >
              <div className="aspect-card">
                <CardImg scryfallId={deck.displayScryfallId} />
              </div>
              <span className="mt-2 block text-sm font-medium text-gray-900 text-center">
                {deck.name}
              </span>
            </Link>
          );
        })}
      </div>
      <DeckImportModal
        isOpen={importingDeck}
        onClose={() => setImportingDeck(false)}
        onCancel={() => setImportingDeck(false)}
        onSubmit={({ name, deckList }) => handleImport({ name, deckList })}
      />
    </div>
  );
};

export default observer(DeckBuilder);
