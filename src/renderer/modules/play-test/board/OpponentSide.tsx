import type { CardView, PublicView } from '@shared/game';
import type { PeerInfo } from '@shared/net/protocol';
import classNames from 'classnames';
import { useState } from 'react';

import Card from '../../../ui/Card';
import { cardWidths } from '../../../ui/cardSizes';
import CardImg from '../../../ui/CardImg';
import { SIDE_PANEL_WIDTH } from './layout';
import ScaledField from './ScaledField';
import ZoneBrowser from './ZoneBrowser';
import ZonePile from './ZonePile';

type Pile = 'graveyard' | 'exile' | 'command';

const pileTitles: Record<Pile, string> = {
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
};

const OpponentCard = ({ card }: { card: CardView }) => {
  const { x, y } = card.position ?? { x: 0, y: 0 };
  return (
    <div
      data-testid="opponent-card"
      className="absolute left-0 top-0"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <Card card={card} size="md" />
    </div>
  );
};

const Count = ({
  label,
  count,
  testId,
  back,
}: {
  label: string;
  count: number;
  testId: string;
  back?: boolean;
}) => (
  <div
    data-testid={testId}
    data-count={count}
    className="flex flex-col items-center gap-1"
  >
    <div
      className={classNames(
        'aspect-card rounded-lg flex items-center justify-center',
        cardWidths.xs,
        back && count > 0
          ? 'overflow-hidden'
          : 'border-2 border-dashed border-slate-500 text-2xl font-bold tabular-nums'
      )}
    >
      {back && count > 0 ? <CardImg name={label} /> : count}
    </div>
    <div className="text-xs font-medium">
      {label} <span className="tabular-nums">{count}</span>
    </div>
  </div>
);

// The other player's half of the table. Everything here comes from their
// public view, so it is read-only: no menus, drags, or drop targets.
const OpponentSide = ({
  peer,
  view,
}: {
  peer: PeerInfo;
  view: PublicView | null;
}) => {
  const [open, setOpen] = useState<Pile | null>(null);
  const piles: Pile[] = view?.zones.command.length
    ? ['graveyard', 'exile', 'command']
    : ['graveyard', 'exile'];

  return (
    <div
      data-testid="opponent-side"
      className="flex h-full min-h-0 border-b-4 border-slate-900 bg-stone-500"
    >
      <div className="flex-1 h-full px-8 py-3">
        {view ? (
          <ScaledField testId="opponent-battlefield">
            {() =>
              view.zones.battlefield.map((card) => (
                <OpponentCard key={card.instanceId} card={card} />
              ))
            }
          </ScaledField>
        ) : (
          <div className="flex h-full items-center justify-center text-lg font-medium text-stone-200">
            {peer.name} has no game open.
          </div>
        )}
      </div>

      <aside
        style={{ width: SIDE_PANEL_WIDTH }}
        className="h-full shrink-0 overflow-y-auto bg-slate-700 p-3 text-slate-100 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div
            data-testid="opponent-name"
            className="truncate text-sm font-semibold uppercase tracking-wide"
          >
            {peer.name}
          </div>
          {view && (
            <div className="text-right">
              <span className="mr-1 text-xs uppercase text-slate-400">
                Life
              </span>
              <span
                data-testid="opponent-life"
                className="text-4xl font-black tabular-nums"
              >
                {view.life}
              </span>
            </div>
          )}
        </div>
        {view && !view.keptHand && (
          <div
            data-testid="opponent-mulligan-status"
            className="rounded bg-amber-200 px-2 py-0.5 text-center text-xs font-semibold text-slate-900"
          >
            Choosing opening hand · Mulligans {view.mulligans}
          </div>
        )}
        {view && (
          <div className="flex flex-wrap justify-between gap-1">
            <Count
              label="Library"
              count={view.libraryCount}
              testId="opponent-library"
              back
            />
            <Count
              label="Hand"
              count={view.handCount}
              testId="opponent-hand-count"
            />
            {piles.map((zone) => (
              <ZonePile
                key={zone}
                zone={zone}
                label={pileTitles[zone]}
                cards={view.zones[zone]}
                onOpen={() => setOpen(zone)}
                size="xs"
                readOnly
                testId={`opponent-${zone}`}
              />
            ))}
          </div>
        )}
      </aside>

      {view && open && (
        <ZoneBrowser
          title={`${peer.name}'s ${pileTitles[open].toLowerCase()}`}
          cards={view.zones[open]}
          onClose={() => setOpen(null)}
          readOnly
        />
      )}
    </div>
  );
};

export default OpponentSide;
