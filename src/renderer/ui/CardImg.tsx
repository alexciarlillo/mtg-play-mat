import classNames from 'classnames';
import { type SyntheticEvent } from 'react';

import { cardBackUrl, cardImageSrc } from './cardImages';

interface Props {
  name?: string;
  scryfallId?: string;
  face?: number;
  className?: string;
  // The back to show with no card to show; the standard one by default.
  back?: string;
}

const absolute = (url: string) => new URL(url, document.baseURI).href;

// An image the cache can't supply (offline miss, unknown card) shows the
// card back rather than a broken image, and a back that fails to load
// shows the standard one.
const showCardBack =
  (back: string) => (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const next = img.src === absolute(back) ? cardBackUrl : back;
    if (img.src !== absolute(next)) img.src = next;
  };

const CardImg = ({
  scryfallId,
  face = 0,
  className = '',
  name = '',
  back = cardBackUrl,
}: Props) => {
  return (
    <img
      className={classNames(className, 'rounded-lg h-full object-cover')}
      src={scryfallId ? cardImageSrc(scryfallId, face) : back}
      onError={showCardBack(back)}
      draggable={false}
      alt={name}
    />
  );
};

export default CardImg;
