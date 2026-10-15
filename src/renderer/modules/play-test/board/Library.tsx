import type { CardRef, LibraryActivity } from '@shared/game';
import classNames from 'classnames';
import type { MouseEvent } from 'react';

import Card from '../../../ui/Card';
import { type CardSize, cardWidths } from '../../../ui/cardSizes';
import { useCardBack } from '../../../ui/CardBackProvider';
import CardImg from '../../../ui/CardImg';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { setLookAtTop, useLookAtTop } from '../common/useLookAtTop';
import { shownCard } from '../common/shownCard';
import { dispatch } from '../viewStore';
import LibraryActivityBadge from './LibraryActivityBadge';
import ZoneCountBadge from './ZoneCountBadge';

interface Props {
  playerId?: string;
  count: number;
  size?: CardSize;
  activity?: LibraryActivity | null;
  // Set only while the player plays with the top card revealed.
  topCard?: CardRef | null;
  onDrawMany(): void;
  onMill(): void;
  onExileTop(): void;
  onLibraryTo(to: 'graveyard' | 'exile'): void;
}

const Library = ({
  playerId,
  count,
  size = 'sm',
  activity = null,
  topCard,
  onDrawMany,
  onMill,
  onExileTop,
  onLibraryTo,
}: Props) => {
  const menu = useContextMenu();
  const canDraw = playerId !== undefined && count > 0;
  const back = useCardBack(playerId);
  const topRevealed = topCard !== undefined;
  const lookAtTop = useLookAtTop();

  const drawCard = () => {
    if (playerId) dispatch({ type: 'draw', playerId, count: 1 });
  };

  const openInHand = (command: 'viewBottom' | 'revealUntil') => () => {
    window.api.openHandDialog(command).catch((err: unknown) => {
      console.error(`[play-test] failed to open ${command}`, err);
    });
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
        { title: 'Exile top N…', action: count > 0 ? onExileTop : null },
        {
          title: 'Put library into graveyard…',
          action: count > 0 ? () => onLibraryTo('graveyard') : null,
        },
        {
          title: 'Exile library…',
          action: count > 0 ? () => onLibraryTo('exile') : null,
        },
        // Opens where the hand is, never on the shared board.
        {
          title: 'View bottom card',
          action: count > 0 ? openInHand('viewBottom') : null,
        },
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
        {
          title: 'Reveal until…',
          action: count > 0 ? openInHand('revealUntil') : null,
        },
        {
          title: topRevealed
            ? 'Stop playing with the top card revealed'
            : 'Play with the top card revealed',
          action: () =>
            dispatch({
              type: 'setTopRevealed',
              playerId,
              revealed: !topRevealed,
            }),
        },
        // Shown only where the hand is, so nobody else ever sees it.
        {
          title: lookAtTop
            ? 'Stop looking at the top card'
            : 'Always look at the top card',
          action: () => setLookAtTop(!lookAtTop),
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
        {count > 0 && !topCard && <CardImg name="Library" back={back} />}
        {topCard && (
          <div data-testid="library-top-card" className="contents">
            <Card card={shownCard(topCard, `top-${playerId}`)} size={size} />
          </div>
        )}
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
