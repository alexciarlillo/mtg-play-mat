import { observer } from 'mobx-react';
import CardImg from 'CardImg';
import { useDeckStore } from 'DeckStore';
import { useState, useEffect } from 'react';
import DeckImportModal from 'DeckImportModal';
import { PlusIcon } from '@heroicons/react/24/outline';
import 'tailwindcss/tailwind.css';

const DeckBuilder = () => {
  const store = useDeckStore();

  const [importingDeck, setImportingDeck] = useState(false);

  handleImport = (deckList) => {
    store.addDeck(deckList);
    setImportingDeck(false);
  };

  useEffect(() => {
    store.refreshDecks();
  }, []);

  return (
    <div className="w-full h-full">
      <div className="w-full h-full flex">
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
            <div className="aspect-card w-52" key={deck.id}>
              <CardImg scryfallId={deck.displayScryfallId} />
            </div>
          );
        })}
      </div>
      <DeckImportModal
        isOpen={importingDeck}
        onClose={() => setImportingDeck(false)}
        onCancel={() => setImportingDeck(false)}
        onSubmit={(deckList) => handleImport(deckList)}
      />
    </div>
  );
};

export default observer(DeckBuilder);
