import type { CardView } from '@shared/game';
import classNames from 'classnames';

import Card from '../../../ui/Card';
import { type CardSize, cardWidths } from '../../../ui/cardSizes';
import { moveMenu } from '../common/cardMenus';
import ZoneCountBadge from './ZoneCountBadge';

interface Props {
  zone: 'graveyard' | 'exile' | 'command';
  label: string;
  cards: CardView[];
  onOpen(): void;
  size?: CardSize;
  // An opponent's pile: no menus, and never a drop target.
  readOnly?: boolean;
  testId?: string;
}

// A public pile showing its top card. Clicking opens the full list, and
// battlefield cards can be dropped onto it.
const ZonePile = ({
  zone,
  label,
  cards,
  onOpen,
  size = 'sm',
  readOnly = false,
  testId = zone,
}: Props) => {
  const top = cards.at(-1);

  return (
    <div
      data-testid={testId}
      data-drop-zone={readOnly ? undefined : zone}
      data-count={cards.length}
      className="flex flex-col items-center gap-1"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Browse ${readOnly ? "opponent's " : ''}${label.toLowerCase()}`}
        className={classNames(
          'relative aspect-card rounded-lg hover:cursor-pointer',
          cardWidths[size],
          top ? 'block' : 'border-2 border-dashed border-slate-500'
        )}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
      >
        {top && (
          <Card card={top} size={size} menu={readOnly ? [] : moveMenu(top)} />
        )}
        <ZoneCountBadge count={cards.length} size={size} />
      </div>
      <div className="text-sm font-medium">{label}</div>
    </div>
  );
};

export default ZonePile;
