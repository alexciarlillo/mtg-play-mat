import PropTypes from 'prop-types';
import Draggable from 'react-draggable';
import classNames from 'classnames';
import { useState, useEffect } from 'react';

const Card = ({ scryfallId, draggable, tappable }) => {
  const [tapped, setTapped] = useState(false);
  const [moved, setMoved] = useState(false);
  const [imageUri, setImageUri] = useState(null);

  useEffect(() => {
    setImageUri(
      `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
        0
      )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
    );
  }, [scryfallId]);

  toggleTapped = () => {
    if (!tappable) {
      return;
    }

    if (!moved) {
      setTapped(!tapped);
    }

    setMoved(false);
  };

  return (
    <Draggable
      onDrag={(args, data) => {
        setMoved(true);
      }}
      disabled={!draggable}
      handle=".handle"
    >
      <div className={classNames('absolute')}>
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
          onClick={toggleTapped}
        >
          {imageUri ? (
            <img
              className="rounded-lg"
              src={imageUri}
              draggable={false}
              alt=""
            />
          ) : null}
        </div>
      </div>
    </Draggable>
  );
};

Card.propTypes = {
  scryfallId: PropTypes.string.isRequired,
  draggable: PropTypes.bool,
  tappable: PropTypes.bool,
};

Card.defaultProps = {
  draggable: true,
  tappable: true,
};

export default Card;
