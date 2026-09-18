import { cardImageUrl, type ImageSize } from '@shared/cardImages';

import cardBackImg from '../assets/back.jpg';

export const cardBackUrl = cardBackImg;

export const cardImageSrc = (
  scryfallId?: string,
  face = 0,
  size: ImageSize = 'normal'
): string => (scryfallId ? cardImageUrl(scryfallId, face, size) : cardBackImg);
