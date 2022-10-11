import PropTypes from 'prop-types';
import Draggable from 'react-draggable';
import classNames from 'classnames';
import { useState, useEffect } from 'react';

const CardImg = ({ scryfallId }) => {
  const [imageUri, setImageUri] = useState(null);

  useEffect(() => {
    setImageUri(
      `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
        0
      )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
    );
  }, [scryfallId]);

  return imageUri ? (
    <img className="rounded-lg" src={imageUri} draggable={false} alt="" />
  ) : null;
};

const Card = ({ scryfallId, draggable, tappable, playable, onPlayed }) => {
  const [tapped, setTapped] = useState(false);
  const [moved, setMoved] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);

  toggleTapped = () => {
    if (!moved) {
      setTapped(!tapped);
    }
  };

  handlePlayed = () => {
    onPlayed?.(scryfallId);
  };

  handleClick = () => {
    if (tappable && !playable) {
      toggleTapped();
    } else if (playable) {
      handlePlayed();
    }

    setMoved(false);
  };

  onDragStart = (event, data) => {
    setLastPosition({ x: data.lastX, y: data.lastY });
  };

  onDragStop = (...args) => {
    setLastPosition(null);
  };

  return (
    <div className="relative">
      <Draggable
        onDrag={(args, data) => {
          setMoved(true);
        }}
        onStart={onDragStart}
        onStop={onDragStop}
        disabled={!draggable}
        handle=".handle"
      >
        <div className={classNames('absolute', 'z-10')}>
          <div
            className={classNames(
              'origin-center',
              'flex',
              'aspect-card',
              'w-52',
              'handle',
              {
                'rotate-90': tapped,
              }
            )}
            onClick={handleClick}
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
};

Card.defaultProps = {
  draggable: true,
  tappable: true,
  playable: false,
};

export default Card;
