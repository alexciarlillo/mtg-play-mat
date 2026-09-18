import classNames from 'classnames';

import { scryfallImageUrl } from './cardImages';

interface Props {
  name?: string;
  scryfallId?: string;
  className?: string;
}

const CardImg = ({ scryfallId, className = '', name = '' }: Props) => {
  return (
    <img
      className={classNames(className, 'rounded-lg h-full')}
      src={scryfallImageUrl(scryfallId)}
      draggable={false}
      alt={name}
    />
  );
};

export default CardImg;
