import {
  EyeIcon,
  EyeSlashIcon,
  PhotoIcon,
  StopIcon,
} from '@heroicons/react/20/solid';
import type { CardView, LibraryActivity, PublicView } from '@shared/game';
import type { PeerInfo } from '@shared/net/protocol';
import type { TableEntry } from '@shared/net/remoteViews';
import classNames from 'classnames';
import { useState } from 'react';

import Card from '../../../ui/Card';
import { useCardBack } from '../../../ui/CardBackProvider';
import { cardWidths } from '../../../ui/cardSizes';
import CardImg from '../../../ui/CardImg';
import { hasCommanders } from './commanders';
import { CommanderDamageTaken } from './CommanderTracker';
import CommandZone from './CommandZone';
import {
  fieldBounds,
  FULL_PANEL_WIDTH,
  POD_PANEL_WIDTH,
  stackOrder,
} from './layout';
import LibraryActivityBadge from './LibraryActivityBadge';
import { lifeFlashClass } from './lifeFlash';
import { phaseLabels } from './phases';
import PlayMat, { MatBackdrop } from './PlayMat';
import { ownerLabel, type OwnerLabels } from './pod';
import PlayerCounters from './PlayerCounters';
import RevealPanel from './RevealPanel';
import ScaledField from './ScaledField';
import SeatLog from './SeatLog';
import ZoneBrowser from './ZoneBrowser';
import ZoneCountBadge from './ZoneCountBadge';
import useValueFlash from './useValueFlash';
import ZonePile from './ZonePile';

type Pile = 'graveyard' | 'exile';

const pileTitles: Record<Pile, string> = {
  graveyard: 'Graveyard',
  exile: 'Exile',
};

const piles: Pile[] = ['graveyard', 'exile'];

const tile =
  'flex w-full items-center justify-between gap-1 rounded bg-slate-800 px-1.5 py-1 text-[11px]';

// A zone as its name and count alone. A pod seat's panel is 184px wide,
// so card-sized piles would wrap into two rows and push the command
// zone off the bottom of the panel.
const ZoneCount = ({
  label,
  count,
  testId,
  activity,
  onOpen,
}: {
  label: string;
  count: number;
  testId: string;
  activity?: LibraryActivity | null;
  onOpen?(): void;
}) => {
  const body = (
    <>
      <span className="truncate">{label}</span>
      <span className="font-bold tabular-nums">{count}</span>
    </>
  );
  return (
    <div
      data-testid={testId}
      data-count={count}
      className="relative flex min-w-0"
    >
      {onOpen ? (
        <button
          type="button"
          aria-label={`Browse opponent's ${label.toLowerCase()}`}
          className={classNames(tile, 'hover:bg-slate-600')}
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        <div className={tile}>{body}</div>
      )}
      <LibraryActivityBadge
        activity={activity}
        compact
        testId={`${testId}-activity`}
      />
    </div>
  );
};

const OpponentCard = ({
  card,
  owner,
}: {
  card: CardView;
  owner: string | null;
}) => {
  const { x, y } = card.position ?? { x: 0, y: 0 };
  return (
    <div
      data-testid="opponent-card"
      data-attached-to={card.attachedTo ?? undefined}
      className="absolute left-0 top-0"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <Card card={card} size="md" owner={owner} />
    </div>
  );
};

const Count = ({
  label,
  count,
  testId,
  back,
  activity,
  owner,
}: {
  label: string;
  count: number;
  testId: string;
  back?: boolean;
  activity?: LibraryActivity | null;
  // Whose card back the library shows.
  owner?: string;
}) => {
  const owned = useCardBack(owner);
  return (
    <div
      data-testid={testId}
      data-count={count}
      className="flex flex-col items-center gap-1"
    >
      <div
        className={classNames(
          'relative aspect-card rounded-lg flex items-center justify-center',
          cardWidths.xs,
          back && count > 0
            ? 'overflow-hidden'
            : 'border-2 border-dashed border-slate-500',
          // A hand has no art to badge, so its count stays the tile.
          !back && 'text-2xl font-bold tabular-nums'
        )}
      >
        {back ? count > 0 && <CardImg name={label} back={owned} /> : count}
        <LibraryActivityBadge
          activity={activity}
          compact
          testId={`${testId}-activity`}
        />
        {back && <ZoneCountBadge count={count} size="xs" />}
      </div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
};

// Another player's part of the table. Everything here comes from their
// public view, so it is read-only: no menus, drags, or drop targets.
// Compact is for a pod, where several of these share the top row.
const OpponentSide = ({
  peer,
  view,
  seat = null,
  compact = false,
  tight = false,
  showTurn = false,
  owners = {},
  hidden = false,
  log = [],
  logOpen = false,
  matId = null,
  matHidden = false,
  onToggleHidden,
  onToggleLog,
  onToggleMat,
}: {
  peer: PeerInfo;
  view: PublicView | null;
  seat?: number | null;
  compact?: boolean;
  // Panel too short for card-sized zone piles beside a command zone.
  tight?: boolean;
  // Follows the local turn tracking setting, not the opponent's.
  showTurn?: boolean;
  owners?: OwnerLabels;
  // Board folded away, usually because this player is out of the game.
  // Only the battlefield goes: the panel is how they are still tracked.
  hidden?: boolean;
  // The whole table history; the seat picks out its own player's part.
  log?: TableEntry[];
  logOpen?: boolean;
  // Their play area background, if they have one and its bytes have
  // arrived.
  matId?: string | null;
  // Folded away here only: it is their mat, this is just our board.
  matHidden?: boolean;
  onToggleHidden?(): void;
  onToggleLog?(): void;
  onToggleMat?(): void;
}) => {
  const [open, setOpen] = useState<Pile | null>(null);
  // Damage across the table is the easiest thing to miss, so it is
  // coloured here too, not only in the log.
  const lifeFlash = useValueFlash(view?.life ?? null);
  const bounds = view ? fieldBounds(view.zones.battlefield) : null;
  // A pod shows every panel at once and keeps its counts above the fold,
  // so only a duel's panel pins: it is the one a tall hand tray leaves
  // too short for a command zone at the bottom of the column.
  const pinCommand = !compact && view !== null && hasCommanders(view);
  // Counts as tiles rather than piles: a pod's panel is too narrow for
  // piles, and a short duel panel too low to show them and the command
  // zone at once.
  const countTiles = compact || tight;

  const hideButton = onToggleHidden && (
    <button
      type="button"
      data-testid="opponent-hide"
      aria-label={`${hidden ? 'Show' : 'Hide'} ${peer.name}'s board`}
      aria-pressed={hidden}
      title={hidden ? 'Show this board' : 'Hide this board'}
      className={classNames(
        'shrink-0 rounded p-0.5 hover:bg-slate-500',
        hidden && 'bg-slate-500 text-amber-300'
      )}
      onClick={onToggleHidden}
    >
      {hidden ? (
        <EyeSlashIcon className="size-4" />
      ) : (
        <EyeIcon className="size-4" />
      )}
    </button>
  );

  const matButton = matId && onToggleMat && (
    <button
      type="button"
      data-testid="opponent-mat-hide"
      aria-label={`${matHidden ? 'Show' : 'Hide'} ${peer.name}'s play area background`}
      aria-pressed={matHidden}
      title={matHidden ? 'Show their background' : 'Hide their background'}
      className={classNames(
        'shrink-0 rounded p-0.5 hover:bg-slate-500',
        matHidden && 'bg-slate-500 text-amber-300'
      )}
      onClick={onToggleMat}
    >
      {matHidden ? (
        <StopIcon className="size-4" />
      ) : (
        <PhotoIcon className="size-4" />
      )}
    </button>
  );

  const name = (
    <div
      data-testid="opponent-name"
      className={classNames(
        'min-w-0 font-semibold uppercase tracking-wide',
        // Names are how seats are told apart, so a pod wraps rather than
        // cutting one off after eight characters. It gets the panel's
        // full width, or a long surname would break mid-word.
        compact
          ? 'break-words text-xs leading-tight'
          : 'flex-1 truncate text-sm'
      )}
    >
      {peer.name}
    </div>
  );

  const life = view && (
    <div className="shrink-0 text-right">
      <span className="mr-1 text-xs uppercase text-slate-400">Life</span>
      <span
        data-testid="opponent-life"
        data-flash={lifeFlash ?? undefined}
        className={classNames(
          'font-black tabular-nums',
          compact ? 'text-3xl' : 'text-4xl',
          lifeFlashClass(lifeFlash, 'text-slate-100')
        )}
      >
        {view.life}
      </span>
    </div>
  );

  const header = compact ? (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-0.5">
          {hideButton}
          {matButton}
        </span>
        {life}
      </div>
      {name}
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <span className="flex shrink-0 items-center gap-0.5">
        {hideButton}
        {matButton}
      </span>
      {name}
      {life}
    </div>
  );

  return (
    <div
      data-testid="opponent-side"
      data-player-name={peer.name}
      data-seat={seat ?? undefined}
      data-hidden={hidden || undefined}
      className={classNames(
        'flex h-full w-full min-w-0 min-h-0 bg-stone-500',
        // A pod tells its seats apart by the dark alleys between them, so
        // the seat itself carries no frame; it only clips a field that
        // would otherwise spill into its neighbour.
        compact ? 'overflow-hidden' : 'border-b-4 border-slate-900'
      )}
    >
      {!hidden && (
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
          {view && bounds ? (
            <ScaledField
              testId="opponent-battlefield"
              fitWidth={bounds.width}
              offsetX={bounds.offsetX}
              backdrop={
                <MatBackdrop
                  id={matHidden ? null : matId}
                  testId="opponent-play-mat-backdrop"
                />
              }
            >
              {() => (
                <>
                  {/* Their mat, in their own field's units, so it sits
                      under their cards exactly as it does on their
                      board. */}
                  <PlayMat
                    id={matHidden ? null : matId}
                    testId="opponent-play-mat"
                  />
                  {stackOrder(view.zones.battlefield).map((card) => (
                    <OpponentCard
                      key={card.instanceId}
                      card={card}
                      owner={ownerLabel(card, peer.playerId, owners)}
                    />
                  ))}
                </>
              )}
            </ScaledField>
          ) : (
            <div className="flex h-full items-center justify-center text-lg font-medium text-stone-200">
              {peer.name} has no game open.
            </div>
          )}
        </div>
      )}

      <aside
        style={{ width: compact ? POD_PANEL_WIDTH : FULL_PANEL_WIDTH }}
        className="h-full shrink-0 bg-slate-700 text-slate-100 flex flex-col"
      >
        <div
          className={classNames(
            'scroll-visible min-h-0 overflow-y-auto flex flex-col gap-2',
            // An open log takes the room the counts do not need, so a
            // taller row buys history rather than empty panel.
            logOpen ? 'flex-initial' : 'flex-1',
            compact ? 'p-2' : 'p-3'
          )}
        >
          {header}
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
            <div className="flex flex-col gap-1">
              {countTiles ? (
                <div className="grid grid-cols-2 gap-1">
                  <ZoneCount
                    label="Library"
                    count={view.libraryCount}
                    testId="opponent-library"
                    activity={view.libraryActivity}
                  />
                  <ZoneCount
                    label="Hand"
                    count={view.handCount}
                    testId="opponent-hand-count"
                  />
                  {piles.map((zone) => (
                    <ZoneCount
                      key={zone}
                      label={pileTitles[zone]}
                      count={view.zones[zone].length}
                      testId={`opponent-${zone}`}
                      onOpen={() => setOpen(zone)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap justify-between gap-1">
                  <Count
                    label="Library"
                    count={view.libraryCount}
                    testId="opponent-library"
                    back
                    owner={peer.playerId}
                    activity={view.libraryActivity}
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
              {!pinCommand && hasCommanders(view) && (
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
        </div>
        {/* Pinned below the scrolling column: a seat is read for its
            command zone and tax, and a tall hand tray leaves a duel's
            panel too short to hold everything above them. */}
        {view && pinCommand && (
          <div className="scroll-visible max-h-[50%] shrink-0 overflow-y-auto border-t border-slate-600 px-3 py-2">
            <CommandZone
              view={view}
              size="xs"
              readOnly
              testId="opponent-command"
            />
          </div>
        )}
        <SeatLog
          log={log}
          playerId={peer.playerId}
          name={peer.name}
          open={logOpen}
          compact={compact}
          onToggle={onToggleLog}
        />
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
