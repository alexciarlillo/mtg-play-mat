import type { TokenSearchResult } from '@shared/types/cards';

import { createPrintingCache } from './printingCache';

const NONE: TokenSearchResult[] = [];

const tokens = createPrintingCache<TokenSearchResult[]>(
  'related tokens',
  (ids) => window.api.relatedTokens(ids)
);

// The tokens, emblems and designations a printing makes, once loaded.
export const relatedTokens = (id: string): TokenSearchResult[] =>
  tokens.get(id) ?? NONE;

export const relatedTokensSettled = (id: string): boolean => tokens.settled(id);

export const useRelatedTokens = (
  ids: readonly string[]
): ((id: string) => TokenSearchResult[]) => {
  tokens.useLookup(ids);
  return relatedTokens;
};

const tokenKey = ({ ref, oracleId }: TokenSearchResult) =>
  oracleId ??
  [ref.name, ref.typeLine, ref.power ?? '', ref.toughness ?? ''].join('|');

// One entry per distinct token across the given printings, by name.
export const distinctTokens = (
  ids: readonly string[],
  lookup: (id: string) => TokenSearchResult[] = relatedTokens
): TokenSearchResult[] => {
  const found = new Map<string, TokenSearchResult>();
  ids.forEach((id) => {
    lookup(id).forEach((token) => {
      const key = tokenKey(token);
      if (!found.has(key)) found.set(key, token);
    });
  });
  return [...found.values()].sort((a, b) =>
    a.ref.name.localeCompare(b.ref.name)
  );
};
