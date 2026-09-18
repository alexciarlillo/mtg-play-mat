import cardBackImg from '../assets/back.jpg';

export const scryfallImageUrl = (scryfallId?: string): string => {
  if (scryfallId) {
    return `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
      0
    )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`;
  }
  return cardBackImg;
};
