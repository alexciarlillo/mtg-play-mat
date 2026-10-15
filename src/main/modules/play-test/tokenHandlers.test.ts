// @vitest-environment node
import type { Printing, TokenSearchResult } from '@shared/types/cards';
import { describe, expect, it, vi } from 'vitest';

import type CardDB from '../../shared/db/CardDB';
import createTokenHandlers from './tokenHandlers';

const treasure = {
  id: '1728ad2d-c8a6-49e4-85bb-29934fa26208',
  oracleId: 'o-treasure',
  name: 'Treasure',
  layout: 'token',
  typeLine: 'Token Artifact — Treasure',
  setCode: 'tmom',
  setName: 'March of the Machine Tokens',
  faces: [{ name: 'Treasure', typeLine: 'Token Artifact — Treasure' }],
} as unknown as Printing;

const setup = () => {
  const relatedTokens = vi.fn(
    (ids: string[]) =>
      new Map(
        ids
          .filter((id) => id === 'maker' || id === '__proto__')
          .map((id) => [id, [treasure]])
      )
  );
  const cardDb = { relatedTokens } as unknown as CardDB;
  const handlers = createTokenHandlers({ cardDb });
  const related = (ids: unknown) =>
    handlers.relatedTokens(ids as string[]) as Record<
      string,
      TokenSearchResult[]
    >;
  return { relatedTokens, related };
};

describe('relatedTokens', () => {
  it('gives each known printing its tokens as cards ready to play', () => {
    const { related } = setup();
    expect(related(['maker', 'none'])).toEqual({
      maker: [
        {
          ref: {
            id: treasure.id,
            name: 'Treasure',
            typeLine: 'Token Artifact — Treasure',
            faces: [
              { name: 'Treasure', typeLine: 'Token Artifact — Treasure' },
            ],
            layout: 'token',
          },
          setCode: 'tmom',
          setName: 'March of the Machine Tokens',
          oracleId: 'o-treasure',
        },
      ],
    });
  });

  it('keeps only distinct string ids, and odd ids stay data', () => {
    const { relatedTokens, related } = setup();
    expect(related('maker')).toEqual({});
    related(['maker', 'maker', 7, '', 'x'.repeat(65)]);
    expect(relatedTokens).toHaveBeenLastCalledWith(['maker']);
    const odd = related(['__proto__']);
    expect(Object.hasOwn(odd, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(odd)).toBe(Object.prototype);
  });
});
