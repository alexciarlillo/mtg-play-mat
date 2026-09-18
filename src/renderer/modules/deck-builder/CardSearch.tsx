import type { CardNameResult } from '@shared/types/decks';
import { useEffect, useState } from 'react';

import { inputClass } from './deckUi';

interface Props {
  label: string;
  placeholder?: string;
  initialQuery?: string;
  autoFocus?: boolean;
  onPick(card: CardNameResult): void;
}

const DEBOUNCE_MS = 150;

// A name search over the card database that picks a card (not a
// printing); callers get the card's default printing with it.
const CardSearch = ({
  label,
  placeholder,
  initialQuery = '',
  autoFocus,
  onPick,
}: Props) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CardNameResult[]>([]);
  const [focused, setFocused] = useState(Boolean(autoFocus));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.api.searchCardNames(query).then((found) => {
        if (!cancelled) setResults(found);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const pick = (card: CardNameResult) => {
    onPick(card);
    setQuery('');
    setResults([]);
  };

  return (
    <div className="relative">
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        className={inputClass}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault();
            pick(results[0]);
          }
        }}
      />
      {focused && query.trim().length > 1 && (
        <ul
          role="listbox"
          aria-label={`${label} results`}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md bg-white text-sm shadow-lg ring-1 ring-black/10"
        >
          {results.length === 0 && (
            <li className="px-2 py-1 text-gray-500">No matching cards</li>
          )}
          {results.map((card) => (
            <li
              key={card.defaultPrinting.id}
              role="option"
              aria-selected={false}
              className="flex cursor-pointer justify-between gap-2 px-2 py-1 hover:bg-indigo-50"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(card);
              }}
            >
              <span className="truncate">{card.name}</span>
              <span className="truncate text-xs text-gray-500">
                {card.typeLine}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CardSearch;
