import { describe, expect, it } from 'vitest';

import { cardImageSrc } from './cardImages';

describe('cardImageSrc', () => {
  it('points at the cached card:// image for the face and size', () => {
    expect(cardImageSrc('3279314f-d639-4489-b2ab-3621bb3ca64b')).toBe(
      'card://3279314f-d639-4489-b2ab-3621bb3ca64b/0/normal'
    );
    expect(
      cardImageSrc('3279314f-d639-4489-b2ab-3621bb3ca64b', 1, 'large')
    ).toBe('card://3279314f-d639-4489-b2ab-3621bb3ca64b/1/large');
  });

  it('falls back to the bundled card back', () => {
    expect(cardImageSrc()).toMatch(/back\.jpg$/);
  });
});
