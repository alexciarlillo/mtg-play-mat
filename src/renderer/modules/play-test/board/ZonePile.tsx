import type { CardView } from '@shared/game';
import classNames from 'classnames';

import Card from '../../../ui/Card';
import { cardWidths } from '../../../ui/cardSizes';
import { moveMenu } from '../common/cardMenus';

interface Props {
  zone: 'graveyard' | 'exile';
  label: string;
  cards: CardView[];
  onOpen(): void;
}

// A public pile showing its top card. Clicking opens the full list, and
// battlefield cards can be dropped onto it.
const ZonePile = ({ zone, label, cards, onOpen }: Props) => {
  const top = cards.at(-1);

  return (
    <div
      data-testid={zone}
      data-drop-zone={zone}
      data-count={cards.length}
      className="flex flex-col items-center gap-1"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Browse ${label.toLowerCase()}`}
        className={classNames(
          'aspect-card rounded-lg hover:cursor-pointer',
          cardWidths.sm,
          top ? 'block' : 'border-2 border-dashed border-slate-500'
        )}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
      >
        {top && <Card card={top} size="sm" menu={moveMenu(top)} />}
      </div>
      <div className="text-sm font-medium">
        {label} <span className="tabular-nums">{cards.length}</span>
      </div>
    </div>
  );
};

export default ZonePile;
