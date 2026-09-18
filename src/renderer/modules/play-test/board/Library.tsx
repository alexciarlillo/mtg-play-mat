import classNames from 'classnames';

import CardImg from '../../../ui/CardImg';
import { dispatch } from '../viewStore';

interface Props {
  playerId?: string;
  count: number;
}

const Library = ({ playerId, count }: Props) => {
  const canDraw = playerId !== undefined && count > 0;

  const drawCard = () => {
    if (playerId) dispatch({ type: 'draw', playerId, count: 1 });
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Draw a card"
        className={classNames(
          'origin-center',
          'flex',
          'justify-center',
          'items-center',
          'aspect-card',
          'w-52',
          'rounded-lg',
          { 'hover:cursor-pointer': canDraw }
        )}
        onClick={canDraw ? drawCard : undefined}
      >
        <CardImg />
      </div>
      <div>Cards: {count}</div>
    </div>
  );
};

export default Library;
