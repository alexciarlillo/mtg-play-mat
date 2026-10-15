import { type Designation, designations } from '@shared/designations';
import { type CardRef, MAX_TOKENS } from '@shared/game';
import type { TokenSearchResult } from '@shared/types/cards';
import classNames from 'classnames';
import { type FormEvent, useEffect, useState } from 'react';

import CardArt from '../../../ui/CardArt';
import { Modal } from '../common/Dialogs';
import {
  distinctTokens,
  relatedTokensSettled,
  useRelatedTokens,
} from '../common/relatedTokens';
import { createTokensAction } from '../common/tokenMenu';
import { dispatch } from '../viewStore';
import { customTokenRef } from './customToken';
import { placeDesignation } from './designations';

const input = 'rounded px-2 py-1 ring-1 ring-slate-400';
const button =
  'rounded px-3 py-1 text-sm font-medium disabled:opacity-40 ring-1 ring-slate-400';

type Tab = 'search' | 'custom';

const useTokenSearch = (query: string) => {
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [searched, setSearched] = useState('');

  // Debounced, and a late reply for an older query is ignored.
  useEffect(() => {
    const q = query.trim();
    let live = true;
    const timer = setTimeout(() => {
      if (!q) {
        setResults([]);
        setSearched('');
        return;
      }
      window.api.searchTokens(q).then(
        (found) => {
          if (!live) return;
          setResults(found);
          setSearched(q);
        },
        (err: unknown) => console.error('[play-test] token search', err)
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, searched };
};

// Every token the open deck's main deck and commanders make, asked for
// only once they're to be shown.
const useDeckTokens = (wanted: boolean) => {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    window.api.getDeckPrintingIds().then(
      (found) => {
        if (live) setIds(found);
      },
      (err: unknown) => console.error('[play-test] deck printings', err)
    );
    return () => {
      live = false;
    };
  }, [wanted]);
  const tokensOf = useRelatedTokens(ids ?? []);
  return {
    tokens: distinctTokens(ids ?? [], tokensOf),
    settled: ids !== null && ids.every(relatedTokensSettled),
  };
};

const TokenChoice = ({
  result,
  chosen,
  onChoose,
}: {
  result: TokenSearchResult;
  chosen: boolean;
  onChoose(): void;
}) => (
  <button
    type="button"
    data-testid="token-result"
    aria-pressed={chosen}
    title={`${result.ref.name} · ${result.setName}`}
    className={classNames(
      'flex flex-col items-center gap-1 rounded-lg p-1 text-xs',
      chosen ? 'bg-sky-200 ring-2 ring-sky-500' : 'hover:bg-stone-300'
    )}
    onClick={onChoose}
  >
    <div className="aspect-card w-full">
      <CardArt cardRef={result.ref} />
    </div>
    <span className="w-full truncate font-medium">{result.ref.name}</span>
    <span className="w-full truncate uppercase text-slate-500">
      {result.setCode}
    </span>
  </button>
);

const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 overflow-y-auto p-1';

const TokenDialog = ({
  playerId,
  docked = false,
  onClose,
}: {
  playerId: string;
  // A board without the hand may be shared on screen, and the deck's
  // tokens hint at cards still hidden in the library.
  docked?: boolean;
  onClose(): void;
}) => {
  const [showDeck, setShowDeck] = useState(docked);
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<CardRef | null>(null);
  const [count, setCount] = useState('1');
  const [custom, setCustom] = useState({
    name: '',
    typeLine: 'Token Creature',
    power: '1',
    toughness: '1',
  });
  const { results, searched } = useTokenSearch(query);
  const deck = useDeckTokens(showDeck);

  const n = Number(count);
  const validCount = Number.isInteger(n) && n >= 1 && n <= MAX_TOKENS;
  const ref =
    tab === 'search'
      ? chosen
      : custom.name.trim()
        ? customTokenRef(custom)
        : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ref || !validCount) return;
    dispatch(createTokensAction(playerId, ref, n));
    onClose();
  };

  const place = (designation: Designation) => {
    void placeDesignation(designation, playerId);
    onClose();
  };

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      className={classNames(
        'rounded-t px-3 py-1 text-sm font-medium',
        tab === value ? 'bg-slate-800 text-white' : 'hover:bg-stone-300'
      )}
      onClick={() => setTab(value)}
    >
      {label}
    </button>
  );

  return (
    <Modal title="Create token" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div role="tablist" className="flex gap-1 border-b border-slate-800">
          {tabButton('search', 'Search tokens')}
          {tabButton('custom', 'Custom token')}
        </div>

        {tab === 'search' ? (
          <>
            <div
              role="group"
              aria-label="Designations"
              className="flex flex-wrap items-center gap-1 text-sm"
            >
              <span className="mr-1 text-slate-600">Designations:</span>
              {designations.map((designation) => (
                <button
                  key={designation.key}
                  type="button"
                  className={button}
                  data-testid={`designation-${designation.key}`}
                  onClick={() => place(designation)}
                >
                  {designation.label}
                </button>
              ))}
            </div>
            <input
              autoFocus
              aria-label="Token name"
              placeholder="Token name, e.g. Soldier or Treasure"
              className={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() === '' && !showDeck && (
              <button
                type="button"
                className={`${button} self-start`}
                onClick={() => setShowDeck(true)}
              >
                Show this deck’s tokens
              </button>
            )}
            {query.trim() === '' && showDeck && deck.settled && (
              <section aria-label="This deck’s tokens">
                <h3 className="text-sm font-medium">This deck’s tokens</h3>
                {deck.tokens.length === 0 && (
                  <p className="text-sm text-slate-600">
                    None found. Card data may need updating.
                  </p>
                )}
                <div
                  data-testid="deck-tokens"
                  className={`${grid} max-h-[40vh]`}
                >
                  {deck.tokens.map((result) => (
                    <TokenChoice
                      key={result.ref.id}
                      result={result}
                      chosen={chosen?.id === result.ref.id}
                      onChoose={() => setChosen(result.ref)}
                    />
                  ))}
                </div>
              </section>
            )}
            <div data-testid="token-results" className={`${grid} max-h-[50vh]`}>
              {results.map((result) => (
                <TokenChoice
                  key={result.ref.id}
                  result={result}
                  chosen={chosen?.id === result.ref.id}
                  onChoose={() => setChosen(result.ref)}
                />
              ))}
              {searched && results.length === 0 && (
                <p className="col-span-full text-sm text-slate-600">
                  No tokens named “{searched}”. Card data may not be downloaded
                  yet; a custom token always works.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
            <label htmlFor="custom-token-name">Name</label>
            <input
              id="custom-token-name"
              autoFocus
              className={input}
              value={custom.name}
              maxLength={60}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            />
            <label htmlFor="custom-token-type">Type</label>
            <input
              id="custom-token-type"
              className={input}
              value={custom.typeLine}
              maxLength={100}
              onChange={(e) =>
                setCustom({ ...custom, typeLine: e.target.value })
              }
            />
            <span>P/T</span>
            <div className="flex items-center gap-1">
              <input
                aria-label="Power"
                className={`${input} w-16`}
                value={custom.power}
                maxLength={5}
                onChange={(e) =>
                  setCustom({ ...custom, power: e.target.value })
                }
              />
              /
              <input
                aria-label="Toughness"
                className={`${input} w-16`}
                value={custom.toughness}
                maxLength={5}
                onChange={(e) =>
                  setCustom({ ...custom, toughness: e.target.value })
                }
              />
              <span className="text-slate-500">(blank for none)</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            How many?
            <input
              type="number"
              aria-label="How many?"
              className={`${input} w-20`}
              min={1}
              max={MAX_TOKENS}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </label>
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${button} bg-slate-800 text-white`}
            disabled={!ref || !validCount}
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TokenDialog;
