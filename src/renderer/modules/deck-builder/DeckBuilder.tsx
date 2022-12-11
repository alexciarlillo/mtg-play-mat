import { useState } from 'react';
import DeckImportModal from 'DeckImportModal';
import { PlusIcon } from '@heroicons/react/24/outline';
import 'tailwindcss/tailwind.css';

const DeckBuilder = () => {
  const [importingDeck, setImportingDeck] = useState(false);

  handleImport = (deckList) => {
    // window.Main.rendererChannel.sen(deckList);
    window.DeckBuilder.import(deckList);
    setImportingDeck(false);
  };

  return (
    <div className="w-full h-full">
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
      <DeckImportModal
        isOpen={importingDeck}
        onClose={() => setImportingDeck(false)}
        onCancel={() => setImportingDeck(false)}
        onSubmit={(deckList) => handleImport(deckList)}
      />
    </div>
  );
};

export default DeckBuilder;
