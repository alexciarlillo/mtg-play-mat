import { describe, expect, it } from 'vitest';

import { scryfallImageUrl } from './cardImages';

describe('scryfallImageUrl', () => {
  it('builds the sharded Scryfall CDN path from the id', () => {
    expect(scryfallImageUrl('3279314f-d639-4489-b2ab-3621bb3ca64b')).toBe(
      'https://cards.scryfall.io/normal/front/3/2/3279314f-d639-4489-b2ab-3621bb3ca64b.jpg'
    );
  });

  it('falls back to the bundled card back', () => {
    expect(scryfallImageUrl()).toMatch(/back\.jpg$/);
  });
});
