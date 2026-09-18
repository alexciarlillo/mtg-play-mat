import { PlusIcon } from '@heroicons/react/24/outline';
import { DeckRow } from '@shared/types/cards';
import { observer } from 'mobx-react-lite';
import { MouseEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';

import CardImg from '../../ui/CardImg';
import { useContextMenu } from '../../ui/ContextMenuProvider';
import DeckImportModal, { DeckImportValues } from './DeckImportModal';
import { useDeckStore } from './DeckStoreContext';

const DeckBuilder = () => {
  const store = useDeckStore();
  const menu = useContextMenu();

  const [importingDeck, setImportingDeck] = useState(false);

  const handleImport = ({ name, deckList }: DeckImportValues) => {
    store.addDeck({ name, deckList });
    setImportingDeck(false);
  };

  useEffect(() => {
    store.refreshDecks();
  }, [store]);

  const deckMenu = (e: MouseEvent, deck: DeckRow) => {
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
          className="relative aspect-card w-52 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex flex-col items-center justify-center"
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
              className="w-52 aspect-card"
              key={deck.id}
              onContextMenu={(e) => deckMenu(e, deck)}
              to={`/decks/${deck.id}`}
            >
              <div>
                <CardImg
                  scryfallId={deck.displayScryfallId}
                  className="hover:ring-3 hover:ring-indigo-400"
                />
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
        onSubmit={handleImport}
      />
    </div>
  );
};

export default observer(DeckBuilder);
