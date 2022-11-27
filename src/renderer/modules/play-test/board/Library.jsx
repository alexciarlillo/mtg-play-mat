import classNames from 'classnames';
import { observer } from 'mobx-react';
import { useBoardStore } from 'BoardStore';
import 'tailwindcss/tailwind.css';
import CardImg from 'CardImg';

const Library = () => {
  const board = useBoardStore();

  drawCard = () => {
    board.drawCard();
  };

  return (
    <div>
      <div
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
        onClick={board.library.length > 0 ? drawCard : null}
      >
        <CardImg />
      </div>
      <div className={classNames()}>Cards: {board.library.length}</div>
    </div>
  );
};

export default observer(Library);
