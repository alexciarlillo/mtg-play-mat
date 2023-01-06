import classNames from 'classnames';

import cardBackImg from '../../../assets/back.jpg';

interface Props {
  name?: string;
  scryfallId: string;
  className?: string;
}

const ScryfallImageGen = (scryfallId?: string): string => {
  if (scryfallId) {
    return `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
      0
    )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`;
  }
  return cardBackImg;
};

const CardImg = ({ scryfallId, className = '', name = '' }: Props) => {
  return (
    <img
      className={classNames(className, 'rounded-lg h-full')}
      src={ScryfallImageGen(scryfallId)}
      draggable={false}
      alt={name}
    />
  );
};

export default CardImg;
