import { SearchCardsByNameRet } from '@shared/types/cards';
import classNames from 'classnames';
import { ReactElement, useEffect, useRef } from 'react';

import CardImg from '../../../ui/CardImg';

interface Props {
  selected: boolean;
  setSelected(): void;
  card: SearchCardsByNameRet;
}

const CollectionCardWrapper = ({
  selected,
  setSelected,
  card,
}: Props): ReactElement => {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && fieldRef.current) {
      fieldRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'start',
      });
    }
  }, [selected]);

  return (
    <div
      ref={fieldRef}
      role="button"
      className={classNames(
        'w-52 aspect-card p-4 border-gray-300 border-solid border',
        selected && 'bg-blue-200'
      )}
      onClick={setSelected}
    >
      <div className="flex justify-between items-center pb-2">
        <div className="truncate font-sans text-sm">{card.name}</div>
        <i
          className={classNames(
            `ss ss-${card.keyruneCode?.toLowerCase()} pl-2`
          )}
        />
      </div>
      <CardImg
        className={classNames(!selected && 'opacity-60')}
        scryfallId={card.scryfallId}
      />
    </div>
  );
};

export default CollectionCardWrapper;
