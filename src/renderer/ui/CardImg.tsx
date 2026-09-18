import classNames from 'classnames';
import { type SyntheticEvent } from 'react';

import { cardBackUrl, cardImageSrc } from './cardImages';

interface Props {
  name?: string;
  scryfallId?: string;
  face?: number;
  className?: string;
}

// An image the cache can't supply (offline miss, unknown card) shows the
// card back rather than a broken image.
const showCardBack = (event: SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  if (img.src !== new URL(cardBackUrl, document.baseURI).href) {
    img.src = cardBackUrl;
  }
};

const CardImg = ({
  scryfallId,
  face = 0,
  className = '',
  name = '',
}: Props) => {
  return (
    <img
      className={classNames(className, 'rounded-lg h-full')}
      src={cardImageSrc(scryfallId, face)}
      onError={showCardBack}
      draggable={false}
      alt={name}
    />
  );
};

export default CardImg;
