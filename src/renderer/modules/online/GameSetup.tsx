import type { DeckSummary } from '@shared/types/decks';
import type { PlayTestStatus } from '@shared/types/playTest';
import { type Ref, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { ConfirmDialog } from '../play-test/common/Dialogs';

const button =
  'rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-40';
const primary = `${button} bg-indigo-600 text-white hover:bg-indigo-500`;
const secondary = `${button} bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50`;

const SAMPLE = 'sample';

const call = (promise: Promise<unknown>) => {
  promise.catch((err: unknown) => console.error('[online]', err));
};

const choiceOf = (deck: PlayTestStatus['deck']) =>
  deck ? String(deck.id ?? SAMPLE) : null;

type Pending = 'restart' | 'switch' | 'close';

const confirmations: Record<
  Pending,
  { title: string; message: string; confirmLabel: string }
> = {
  restart: {
    title: 'Restart game?',
    message:
      'Starts a new game with the same deck: everything is shuffled back and you draw a new opening hand.',
    confirmLabel: 'Restart',
  },
  switch: {
    title: 'Switch decks?',
    message: 'Ends the current game and starts a new one with this deck.',
    confirmLabel: 'Switch deck',
  },
  close: {
    title: 'Close game?',
    message: 'Ends the current game and closes the board and hand windows.',
    confirmLabel: 'Close game',
  },
};

// Picks a deck and opens the table from the lobby, so starting an online
// game doesn't need a detour through the deck builder.
const GameSetup = ({
  status,
  selectRef,
}: {
  status: PlayTestStatus;
  selectRef?: Ref<HTMLSelectElement>;
}) => {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    let live = true;
    window.api.listDecks().then(
      (list) => {
        if (live) setDecks(list);
      },
      (err: unknown) => console.error('[online] listing decks failed', err)
    );
    return () => {
      live = false;
    };
  }, []);

  const openChoice = status.open ? choiceOf(status.deck) : null;
  const firstDeck = decks?.[0] ? String(decks[0].id) : null;
  const selected =
    choice ?? openChoice ?? firstDeck ?? (status.sampleDeck ? SAMPLE : '');

  const start = () => {
    if (selected === SAMPLE) {
      call(window.api.startSamplePlayTest());
    } else if (selected) {
      call(window.api.startPlayTest(Number(selected)));
    }
  };

  const run: Record<Pending, () => void> = {
    restart: () => call(window.api.restartPlayTest()),
    switch: start,
    close: () => call(window.api.closePlayTest()),
  };

  const noDecks = decks !== null && decks.length === 0 && !status.sampleDeck;

  return (
    <section
      data-testid="game-setup"
      data-open={status.open}
      className="space-y-3 rounded-lg p-3 ring-1 ring-gray-200"
    >
      <h3 className="text-sm font-semibold text-gray-900">Your game</h3>
      {status.open && status.deck ? (
        <p data-testid="game-status" className="text-sm text-green-800">
          Game open with {status.deck.name}.
        </p>
      ) : (
        <p data-testid="game-status" className="text-sm text-gray-600">
          No game open. Pick a deck and start the game to open your table.
        </p>
      )}

      {noDecks ? (
        <p className="text-sm text-gray-600">
          You have no saved decks yet.{' '}
          <Link to="/decks" className="font-medium text-indigo-600">
            Import one in the Deck Builder
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium text-gray-900">
            Deck
            <select
              ref={selectRef}
              aria-label="Deck"
              className="mt-1 block w-72 rounded-md border-0 px-2 py-1.5 text-gray-900 ring-1 ring-gray-300"
              value={selected}
              disabled={decks === null}
              onChange={(e) => setChoice(e.target.value)}
            >
              {decks?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} ({deck.cardCount} cards)
                </option>
              ))}
              {status.sampleDeck && (
                <option value={SAMPLE}>Sample deck (dev)</option>
              )}
            </select>
          </label>
          {!status.open && (
            <button
              type="button"
              className={primary}
              disabled={!selected}
              onClick={start}
            >
              Start game
            </button>
          )}
          {status.open && selected !== openChoice && (
            <button
              type="button"
              className={primary}
              disabled={!selected}
              onClick={() => setPending('switch')}
            >
              Switch deck
            </button>
          )}
          {status.open && (
            <>
              <button
                type="button"
                className={secondary}
                onClick={() => setPending('restart')}
              >
                Restart game
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => setPending('close')}
              >
                Close game
              </button>
            </>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          {...confirmations[pending]}
          onConfirm={run[pending]}
          onClose={() => setPending(null)}
        />
      )}
    </section>
  );
};

export default GameSetup;
