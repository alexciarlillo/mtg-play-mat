import type { LibraryActivity } from '@shared/game';
import classNames from 'classnames';
import type { MouseEvent } from 'react';

import { type CardSize, cardWidths } from '../../../ui/cardSizes';
import CardImg from '../../../ui/CardImg';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { dispatch } from '../viewStore';
import LibraryActivityBadge from './LibraryActivityBadge';
import ZoneCountBadge from './ZoneCountBadge';

interface Props {
  playerId?: string;
  count: number;
  size?: CardSize;
  activity?: LibraryActivity | null;
  onDrawMany(): void;
  onMill(): void;
}

const Library = ({
  playerId,
  count,
  size = 'sm',
  activity = null,
  onDrawMany,
  onMill,
}: Props) => {
  const menu = useContextMenu();
  const canDraw = playerId !== undefined && count > 0;

  const drawCard = () => {
    if (playerId) dispatch({ type: 'draw', playerId, count: 1 });
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!playerId) return;
    e.preventDefault();
    e.stopPropagation();
    menu.open({
      specs: [
        { title: 'Draw a card', action: canDraw ? drawCard : null },
        { title: 'Draw N…', action: onDrawMany },
        {
          title: 'Shuffle library',
          action: () => dispatch({ type: 'shuffle', playerId }),
        },
        { title: 'Mill N…', action: count > 0 ? onMill : null },
        {
          title: 'Reveal the top card',
          action:
            count > 0
              ? () =>
                  dispatch({
                    type: 'reveal',
                    playerId,
                    source: 'libraryTop',
                    count: 1,
                  })
              : null,
        },
      ],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div
      data-testid="library"
      data-drop-zone="library"
      data-count={count}
      className="flex flex-col items-center gap-1"
      onContextMenu={handleContextMenu}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Draw a card"
        className={classNames(
          'relative flex justify-center items-center aspect-card rounded-lg',
          cardWidths[size],
          count === 0
            ? 'border-2 border-dashed border-slate-500'
            : 'hover:ring-4 ring-amber-300',
          { 'hover:cursor-pointer': canDraw }
        )}
        onClick={canDraw ? drawCard : undefined}
      >
        {count > 0 && <CardImg name="Library" />}
        <LibraryActivityBadge
          activity={activity}
          compact={size === 'xs'}
          testId="library-activity"
        />
        <ZoneCountBadge count={count} size={size} />
      </div>
      <div className="text-sm font-medium">Library</div>
    </div>
  );
};

export default Library;
