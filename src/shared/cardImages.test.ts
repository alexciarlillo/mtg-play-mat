import { describe, expect, it } from 'vitest';

import { cardImageUrl, parseCardImageUrl } from './cardImages';

const id = '3279314f-d639-4489-b2ab-3621bb3ca64b';

describe('card image urls', () => {
  it('round-trips id, face, and size', () => {
    expect(cardImageUrl(id)).toBe(`card://${id}/0/normal`);
    expect(parseCardImageUrl(cardImageUrl(id, 1, 'png'))).toEqual({
      id,
      face: 1,
      size: 'png',
    });
  });

  it('rejects anything that could escape the cache directory', () => {
    for (const bad of [
      `card://${id}/0/../../etc`,
      `card://${id}/0/normal/extra`,
      `card://${id}/9/normal`,
      `card://${id}/-1/normal`,
      `card://${id}/0/huge`,
      'card://not-an-id/0/normal',
      `https://${id}/0/normal`,
      'not a url',
    ]) {
      expect(parseCardImageUrl(bad)).toBeNull();
    }
  });
});
