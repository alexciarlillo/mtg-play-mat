import { DeckRow } from '@shared/types/cards';

import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import DeckImporter from '../../shared/DeckImporter';
import type { RequestHandlers } from '../../ipc';

interface Deps {
  cardDb: CardDB;
  deckDb: DeckDB;
}

type DeckHandlers = Pick<
  RequestHandlers,
  'listDecks' | 'importDeck' | 'deleteDeck'
>;

const createDeckHandlers = ({ cardDb, deckDb }: Deps): DeckHandlers => {
  // Deck card ids are Scryfall ids, so the cover needs no lookup.
  const listDecks = (): DeckRow[] =>
    deckDb.getDecks().map((deck) => ({
      ...deck,
      displayScryfallId: deck.display_card_id ?? undefined,
    }));

  return {
    listDecks,
    importDeck: ({ name, deckList }) => {
      const importer = new DeckImporter({ cardDb });
      const cards = importer.importFromString({ string: deckList });

      if (cards.length > 0) {
        deckDb.addDeck({
          name,
          displayCardId: cards[0].id,
          cardIds: cards.map((c) => c.id),
        });
      } else {
        console.warn('[decks] no cards resolved; deck not saved');
      }

      return listDecks();
    },
    deleteDeck: (id) => {
      deckDb.deleteDeck({ id });
      return listDecks();
    },
  };
};

export default createDeckHandlers;
