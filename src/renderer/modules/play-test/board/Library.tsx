import classNames from 'classnames';
import { observer } from 'mobx-react-lite';

import CardImg from '../../../ui/CardImg';
import { useBoardStore } from './BoardStoreContext';

const Library = () => {
  const board = useBoardStore();

  const drawCard = () => {
    board.drawCard();
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
          'handle',
          'rounded-lg',
          {
            'hover:cursor-pointer': board.library.length > 0,
          }
        )}
        onClick={board.library.length > 0 ? drawCard : undefined}
      >
        <CardImg />
      </div>
      <div>Cards: {board.library.length}</div>
    </div>
  );
};

export default observer(Library);
