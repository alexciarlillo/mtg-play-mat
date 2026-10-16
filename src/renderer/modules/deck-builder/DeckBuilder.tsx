import { PlusIcon } from '@heroicons/react/24/outline';
import type { DeckSummary } from '@shared/types/decks';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { type MouseEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import CardImg from '../../ui/CardImg';
import MoxfieldBadge from '../moxfield/MoxfieldBadge';
import { useContextMenu } from '../../ui/ContextMenuProvider';
import DeckImportModal from './DeckImportModal';
import { useDeckStore } from './DeckStoreContext';
import type { DeckFilter } from './DeckStore';
import { formatLabels } from './deckUi';

const filters: { value: DeckFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'local', label: 'Local' },
  { value: 'moxfield', label: 'Moxfield' },
];

const DeckBuilder = () => {
  const store = useDeckStore();
  const menu = useContextMenu();
  const navigate = useNavigate();

  const [importingDeck, setImportingDeck] = useState(false);

  useEffect(() => {
    store.refreshDecks();
  }, [store]);

  const copy = (id: number) => {
    window.api.copyDeck(id).then(
      (copyId) => void navigate(`/decks/${copyId}`),
      (err: unknown) => console.error('[decks] could not copy', err)
    );
  };

  const deckMenu = (e: MouseEvent, deck: DeckSummary) => {
    e.preventDefault();
    const remove = () => store.deleteDeck({ id: deck.id });
    menu.open({
      specs: deck.moxfield
        ? [
            {
              title: 'Open on Moxfield',
              action: () => void window.api.openMoxfieldDeck(deck.id),
            },
            { title: 'Make a local copy', action: () => copy(deck.id) },
            // A deck still on Moxfield would only come back next sync.
            ...(deck.moxfield.gone
              ? [{ title: 'Remove', action: remove }]
              : []),
          ]
        : [{ title: 'Delete', action: remove }],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div className="w-full h-full">
      <div
        role="radiogroup"
        aria-label="Show decks"
        className="mb-4 inline-flex rounded-md shadow-xs"
      >
        {filters.map(({ value, label }, i) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={store.filter === value}
            className={classNames(
              'px-3 py-1 text-sm font-medium ring-1 ring-gray-300',
              i === 0 && 'rounded-l-md',
              i === filters.length - 1 && 'rounded-r-md',
              store.filter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            )}
            onClick={() => store.setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {store.filter === 'moxfield' && store.shownDecks.length === 0 && (
        <p className="mb-4 text-sm text-gray-600">
          No Moxfield decks yet. Sync a Moxfield user&apos;s public decks in{' '}
          <Link className="text-indigo-700 underline" to="/settings">
            Settings
          </Link>
          .
        </p>
      )}
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
            New deck
          </span>
          <span className="mt-1 block text-xs text-gray-500">
            Empty, or from a list
          </span>
        </button>
        {store.shownDecks.map((deck) => (
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
            {deck.moxfield && (
              <MoxfieldBadge
                info={deck.moxfield}
                className="mt-1 w-full justify-center"
              />
            )}
          </Link>
        ))}
      </div>
      <DeckImportModal
        isOpen={importingDeck}
        onClose={() => setImportingDeck(false)}
        onSaved={(deckId, empty) => {
          setImportingDeck(false);
          store.refreshDecks();
          // An empty deck is only worth making if you can start filling
          // it in, so go straight there.
          if (empty) void navigate(`/decks/${deckId}`);
        }}
      />
    </div>
  );
};

export default observer(DeckBuilder);
