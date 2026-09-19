import type { CardView, PublicView } from '@shared/game';
import type { PeerInfo } from '@shared/net/protocol';
import classNames from 'classnames';
import { useState } from 'react';

import Card from '../../../ui/Card';
import { cardWidths } from '../../../ui/cardSizes';
import CardImg from '../../../ui/CardImg';
import { hasCommanders } from './commanders';
import { CommanderDamageTaken } from './CommanderTracker';
import CommandZone from './CommandZone';
import {
  fieldWidth,
  POD_PANEL_WIDTH,
  SIDE_PANEL_WIDTH,
  stackOrder,
} from './layout';
import { phaseLabels } from './phases';
import PlayerCounters from './PlayerCounters';
import RevealPanel from './RevealPanel';
import ScaledField from './ScaledField';
import ZoneBrowser from './ZoneBrowser';
import ZonePile from './ZonePile';

type Pile = 'graveyard' | 'exile';

const pileTitles: Record<Pile, string> = {
  graveyard: 'Graveyard',
  exile: 'Exile',
};

const piles: Pile[] = ['graveyard', 'exile'];

const OpponentCard = ({ card }: { card: CardView }) => {
  const { x, y } = card.position ?? { x: 0, y: 0 };
  return (
    <div
      data-testid="opponent-card"
      data-attached-to={card.attachedTo ?? undefined}
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

// Another player's part of the table. Everything here comes from their
// public view, so it is read-only: no menus, drags, or drop targets.
// Compact is for a pod, where several of these share the top row.
const OpponentSide = ({
  peer,
  view,
  seat = null,
  compact = false,
  showTurn = false,
}: {
  peer: PeerInfo;
  view: PublicView | null;
  seat?: number | null;
  compact?: boolean;
  // Follows the local turn tracking setting, not the opponent's.
  showTurn?: boolean;
}) => {
  const [open, setOpen] = useState<Pile | null>(null);

  return (
    <div
      data-testid="opponent-side"
      data-player-name={peer.name}
      data-seat={seat ?? undefined}
      className="flex h-full min-w-0 min-h-0 border-b-4 border-slate-900 bg-stone-500"
    >
      <div
        className={classNames(
          'relative flex-1 min-w-0 h-full',
          compact ? 'px-2 py-2' : 'px-8 py-3'
        )}
      >
        <RevealPanel
          reveal={view?.revealed}
          size={compact ? 'xs' : 'sm'}
          testId="opponent-reveal-panel"
        />
        {view ? (
          <ScaledField
            testId="opponent-battlefield"
            fitWidth={fieldWidth(view.zones.battlefield)}
          >
            {() =>
              stackOrder(view.zones.battlefield).map((card) => (
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
        style={{ width: compact ? POD_PANEL_WIDTH : SIDE_PANEL_WIDTH }}
        className={classNames(
          'h-full shrink-0 overflow-y-auto bg-slate-700 text-slate-100 flex flex-col gap-2',
          compact ? 'p-2' : 'p-3'
        )}
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
                className={classNames(
                  'font-black tabular-nums',
                  compact ? 'text-3xl' : 'text-4xl'
                )}
              >
                {view.life}
              </span>
            </div>
          )}
        </div>
        {view && (
          <PlayerCounters
            counters={view.counters}
            testId="opponent-player-counters"
          />
        )}
        {showTurn && view?.turn !== undefined && (
          <div data-testid="opponent-turn" className="text-xs text-slate-300">
            Turn <span className="font-bold tabular-nums">{view.turn}</span>
            {view.phase && ` · ${phaseLabels[view.phase]}`}
          </div>
        )}
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
            {hasCommanders(view) && (
              <CommandZone
                view={view}
                size="xs"
                readOnly
                testId="opponent-command"
              />
            )}
          </div>
        )}
        {view && (
          <CommanderDamageTaken
            playerId={null}
            sources={[]}
            taken={view.commanderDamage}
            testId="opponent-commander-damage"
          />
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
