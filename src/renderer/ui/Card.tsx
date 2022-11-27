import PropTypes from 'prop-types';
import Draggable from 'react-draggable';
import classNames from 'classnames';
import { useState, useEffect } from 'react';
import CardImg from 'CardImg';
import { useContextMenu } from 'ContextMenuProvider';

const Card = ({
  scryfallId,
  draggable,
  tappable,
  playable,
  onPlayed,
  onMoved,
  onDestroy,
  onExile,
}) => {
  const menu = useContextMenu();
  const [tapped, setTapped] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);

  toggleTapped = () => {
    setTapped(!tapped);
  };

  handleClick = () => {
    if (tappable && !playable) {
      toggleTapped();
    } else if (playable) {
      onPlayed?.(scryfallId);
    }
  };

  onDragStart = (event, data) => {
    setLastPosition({ x: data.lastX, y: data.lastY });
  };

  onDragStop = (_, data) => {
    const dX = Math.abs(data.x - lastPosition.x);
    const dY = Math.abs(data.y - lastPosition.y);

    // count small movements as intended clicks
    if (dX <= 2 && dY <= 2) {
      handleClick();
    } else {
      onMoved?.(scryfallId);
    }

    setLastPosition(null);
  };

  handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('card menu', e);
    menu.open({
      specs: [
        { title: 'Destroy', action: () => onDestroy(scryfallId) },
        { title: 'Exile', action: () => onExile(scryfallId) },
      ],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div className="relative">
      <Draggable
        onStart={onDragStart}
        onStop={onDragStop}
        disabled={!draggable}
        handle=".handle"
      >
        <div
          className={classNames({ absolute: draggable })}
          onClick={draggable ? null : handleClick}
          onContextMenu={handleContextMenu}
        >
          <div
            className={classNames(
              'origin-center',
              'flex',
              'justify-center',
              'items-center',
              'aspect-card',
              'w-52',
              'handle',
              'ring-amber-300',
              'rounded-lg',
              'hover:cursor-pointer',
              {
                absolute: draggable,
                'rotate-90': tapped,
                'hover:ring-4': draggable || tappable || onPlayed,
              }
            )}
          >
            <CardImg scryfallId={scryfallId} />
          </div>
        </div>
      </Draggable>
      {lastPosition && (
        <div
          className={classNames(
            'absolute',
            'origin-center',
            'flex',
            'justify-center',
            'items-center',
            'aspect-card',
            'w-52',
            'z-0',
            'opacity-50'
          )}
          style={{
            transform: `translate(${lastPosition.x}px, ${lastPosition.y}px)`,
          }}
        >
          <div
            className={classNames({
              'rotate-90': tapped,
            })}
          >
            <CardImg scryfallId={scryfallId} />
          </div>
        </div>
      )}
    </div>
  );
};

Card.propTypes = {
  scryfallId: PropTypes.string.isRequired,
  draggable: PropTypes.bool,
  tappable: PropTypes.bool,
  playable: PropTypes.bool,
  onPlayed: PropTypes.func,
  onMoved: PropTypes.func,
};

Card.defaultProps = {
  draggable: true,
  tappable: true,
  playable: false,
  onPlayed: null,
  onMoved: null,
};

export default Card;
