import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import cardBackImg from '../../assets/back.jpg';

const CardImg = ({ scryfallId }) => {
  const [imageUri, setImageUri] = useState(null);

  useEffect(() => {
    if (scryfallId) {
      setImageUri(
        `https://cards.scryfall.io/normal/front/${scryfallId.charAt(
          0
        )}/${scryfallId.charAt(1)}/${scryfallId}.jpg`
      );
    } else {
      setImageUri(cardBackImg);
    }
  }, [scryfallId]);

  return imageUri ? (
    <img
      className="rounded-lg h-full"
      src={imageUri}
      draggable={false}
      alt=""
    />
  ) : null;
};

CardImg.propTypes = {
  scryfallId: PropTypes.string,
};

CardImg.defaultProps = {
  scryfallId: null,
};

export default CardImg;
