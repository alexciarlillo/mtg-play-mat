import { PlusIcon } from '@heroicons/react/24/outline';
import type { DeckSummary } from '@shared/types/decks';
import { observer } from 'mobx-react-lite';
import { type MouseEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';

import CardImg from '../../ui/CardImg';
import { useContextMenu } from '../../ui/ContextMenuProvider';
import DeckImportModal from './DeckImportModal';
import { useDeckStore } from './DeckStoreContext';
import { formatLabels } from './deckUi';

const DeckBuilder = () => {
  const store = useDeckStore();
  const menu = useContextMenu();

  const [importingDeck, setImportingDeck] = useState(false);

  useEffect(() => {
    store.refreshDecks();
  }, [store]);

  const deckMenu = (e: MouseEvent, deck: DeckSummary) => {
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
      <div
        data-testid="deck-list"
        className="grid grid-cols-[repeat(auto-fill,13rem)] gap-6"
      >
        <button
          type="button"
          className="relative aspect-card w-52 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex flex-col items-center justify-center"
          onClick={() => setImportingDeck(true)}
        >
          <PlusIcon className="h-6 w-6" />
          <span className="mt-2 block text-sm font-medium text-gray-900">
            Import a deck
          </span>
        </button>
        {store.decks.map((deck) => (
          <Link
            className="w-52"
            key={deck.id}
            data-testid="deck-tile"
            onContextMenu={(e) => deckMenu(e, deck)}
            to={`/decks/${deck.id}`}
          >
            <div className="aspect-card">
              <CardImg
                scryfallId={deck.displayPrintingId ?? undefined}
                name={deck.name}
                className="hover:ring-3 hover:ring-indigo-400"
              />
            </div>
            <span className="mt-2 block truncate text-sm font-medium text-gray-900 text-center">
              {deck.name}
            </span>
            <span className="block text-xs text-gray-500 text-center">
              {formatLabels[deck.format]} · {deck.cardCount} cards
            </span>
          </Link>
        ))}
      </div>
      <DeckImportModal
        isOpen={importingDeck}
        onClose={() => setImportingDeck(false)}
        onSaved={() => {
          setImportingDeck(false);
          store.refreshDecks();
        }}
      />
    </div>
  );
};

export default observer(DeckBuilder);
