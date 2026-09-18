import {
  type CardView,
  commanderTax,
  type PublicView,
  type PublicZoneId,
} from '@shared/game';
import classNames from 'classnames';

import Card from '../../../ui/Card';
import { type CardSize, cardWidths } from '../../../ui/cardSizes';
import { moveMenu, moveTo } from '../common/cardMenus';
import { visibleCommanders } from './commanders';

const whereLabels: Record<PublicZoneId, string> = {
  command: 'Command zone',
  battlefield: 'On battlefield',
  graveyard: 'In graveyard',
  exile: 'In exile',
};

interface Props {
  view: PublicView;
  size?: CardSize;
  // An opponent's command zone: no casting, menus, or drop target.
  readOnly?: boolean;
  testId?: string;
}

// The command zone with each commander's tax. Clicking a commander here
// casts it (moves it to the battlefield, which counts toward the tax).
const CommandZone = ({
  view,
  size = 'sm',
  readOnly = false,
  testId = 'command-zone',
}: Props) => {
  const commanders = visibleCommanders(view);
  const others = view.zones.command.filter((card) => !card.isCommander);
  const cast = (card: CardView) => moveTo(card, 'battlefield');

  return (
    <div
      data-testid={testId}
      data-drop-zone={readOnly ? undefined : 'command'}
      data-count={view.zones.command.length}
      className="col-span-full flex w-full flex-col gap-1 rounded-lg bg-slate-900/60 p-2"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
        Command zone
      </div>
      <div className="flex flex-wrap gap-2">
        {[...commanders, ...others].map((card) => {
          const inCommand = card.zone === 'command';
          const tax = commanderTax(card);
          return (
            <div
              key={card.instanceId}
              data-testid="commander"
              data-card-name={card.ref?.name}
              data-zone={card.zone}
              className="flex flex-col items-center gap-1"
            >
              {inCommand ? (
                <Card
                  card={card}
                  size={size}
                  onClick={readOnly ? undefined : cast}
                  menu={
                    readOnly
                      ? []
                      : [
                          { title: 'Cast', action: () => cast(card) },
                          ...moveMenu(card),
                        ]
                  }
                />
              ) : (
                <div
                  className={classNames(
                    'min-h-12 rounded-lg border-2 border-dashed border-slate-500 p-1',
                    'flex flex-col items-center justify-center text-center text-xs text-slate-300',
                    cardWidths[size]
                  )}
                >
                  <span className="font-semibold">{card.ref?.name}</span>
                  <span>{whereLabels[card.zone as PublicZoneId]}</span>
                </div>
              )}
              {card.isCommander && (
                <div
                  data-testid="commander-tax"
                  data-tax={tax}
                  title="Commander tax: 2 more mana per previous cast"
                  className={classNames(
                    'rounded px-1.5 text-sm font-bold tabular-nums',
                    tax > 0
                      ? 'bg-amber-300 text-slate-900'
                      : 'bg-slate-700 text-slate-200'
                  )}
                >
                  Tax +{tax}
                </div>
              )}
            </div>
          );
        })}
        {commanders.length === 0 && others.length === 0 && (
          <div
            className={classNames(
              'aspect-card rounded-lg border-2 border-dashed border-slate-500',
              cardWidths[size]
            )}
          />
        )}
      </div>
    </div>
  );
};

export default CommandZone;
