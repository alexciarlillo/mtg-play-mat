import { type CardView, MAX_DUMMIES, type PublicView } from '@shared/game';
import { MAX_DIE_SIDES } from '@shared/net/protocol';
import type { OpponentState } from '@shared/net/remoteViews';
import classNames from 'classnames';
import { type MouseEvent, type ReactNode, useCallback, useState } from 'react';

import useSettings from '../../../hooks/useSettings';
import { cardWidths } from '../../../ui/cardSizes';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { ConfirmDialog, NumberPrompt } from '../common/Dialogs';
import ShortcutHelp from '../common/ShortcutHelp';
import { useGameShortcuts } from '../common/useGameShortcuts';
import UndoButtons from '../common/UndoButtons';
import { dispatch, useView, type ViewStore } from '../viewStore';
import AttachDialog from './AttachDialog';
import BattlefieldCard from './BattlefieldCard';
import CommanderPrompt from './CommanderPrompt';
import {
  commanderSources,
  hasCommanders,
  useCommanderPrompts,
  visibleCommanders,
} from './commanders';
import { CommanderDamageTaken, DummyOpponents } from './CommanderTracker';
import CommandZone from './CommandZone';
import CounterDialog from './CounterDialog';
import Library from './Library';
import { SIDE_PANEL_WIDTH, stackOrder } from './layout';
import LifeCounter from './LifeCounter';
import OpponentSide from './OpponentSide';
import { opponentCommanders, requestRoll, seatOrder } from './pod';
import PlayerCounters from './PlayerCounters';
import RevealPanel from './RevealPanel';
import ScaledField from './ScaledField';
import TableLog from './TableLog';
import TokenDialog from './TokenDialog';
import TurnPanel from './TurnPanel';
import ZoneBrowser from './ZoneBrowser';
import ZonePile from './ZonePile';

const noOpponent: ViewStore<OpponentState> = {
  subscribe: () => () => {},
  getSnapshot: () => null,
};

type Dialog =
  | 'help'
  | 'drawMany'
  | 'mill'
  | 'setLife'
  | 'restart'
  | 'graveyard'
  | 'exile'
  | 'token'
  | 'rollDie';

// Dialogs about one permanent, opened from its menu.
type CardDialog = { kind: 'counter' | 'attach'; card: CardView };

const toolButtonClass =
  'rounded bg-slate-700 px-2 py-1 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-40';

const ToolButton = ({
  onClick,
  children,
  label,
}: {
  onClick(): void;
  children: ReactNode;
  label?: string;
}) => (
  <button
    type="button"
    aria-label={label}
    className={toolButtonClass}
    onClick={onClick}
  >
    {children}
  </button>
);

const dummyName = (view: PublicView) => {
  const names = new Set(view.dummies.map((d) => d.name));
  let n = 1;
  while (names.has(`Opponent ${n}`)) n += 1;
  return `Opponent ${n}`;
};

interface Props {
  store: ViewStore<PublicView>;
  opponent?: ViewStore<OpponentState>;
}

const Board = ({ store, opponent }: Props) => {
  const view = useView(store);
  const remote = useView(opponent ?? noOpponent);
  const menu = useContextMenu();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [cardDialog, setCardDialog] = useState<CardDialog | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const closeCardDialog = useCallback(() => setCardDialog(null), []);
  const onAddCounter = useCallback(
    (card: CardView) => setCardDialog({ kind: 'counter', card }),
    []
  );
  const onAttach = useCallback(
    (card: CardView) => setCardDialog({ kind: 'attach', card }),
    []
  );
  const toggleHelp = useCallback(
    () => setDialog((open) => (open === 'help' ? null : 'help')),
    []
  );

  const prompts = useCommanderPrompts();
  const { turnTracking } = useSettings().settings;

  useGameShortcuts(view, {
    enabled: dialog === null && cardDialog === null && prompts.length === 0,
    onHelp: toggleHelp,
  });

  const playerId = view?.playerId;
  const canAddDummy = view !== null && view.dummies.length < MAX_DUMMIES;
  const addDummy = () => {
    if (view && canAddDummy) {
      dispatch({
        type: 'addDummy',
        playerId: view.playerId,
        name: dummyName(view),
      });
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const inDialog = (e.target as Element).closest('[role="dialog"]');
    if (!playerId || inDialog) return;
    menu.open({
      specs: [
        { title: 'Create token…', action: () => setDialog('token') },
        {
          title: 'Draw a card',
          action: () => dispatch({ type: 'draw', playerId, count: 1 }),
        },
        { title: 'Draw N…', action: () => setDialog('drawMany') },
        { title: 'Mill N…', action: () => setDialog('mill') },
        {
          title: 'Untap all',
          action: () => dispatch({ type: 'untapAll', playerId }),
        },
        {
          title: 'Shuffle library',
          action: () => dispatch({ type: 'shuffle', playerId }),
        },
        ...(canAddDummy
          ? [{ title: 'Add placeholder opponent', action: addDummy }]
          : []),
        { title: 'Keyboard shortcuts', action: () => setDialog('help') },
      ],
      x: e.pageX,
      y: e.pageY,
    });
  };

  const peers = remote ? seatOrder(remote.peers, remote.selfSeat) : [];
  const log = remote?.log ?? [];
  // With an opponent the board splits in two and the own panel compacts.
  // Three or four players put every opponent in one row across the top.
  const duel = peers.length > 0;
  const pod = peers.length > 1;
  const commanderGame = view !== null && hasCommanders(view);
  // The command zone needs room too, so piles shrink to one row for it.
  const compactPiles = duel || commanderGame;
  const pileSize = compactPiles ? 'xs' : 'sm';

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-400 flex flex-col">
      {duel && (
        <div
          data-testid="opponents"
          className="grid h-1/2 min-h-0 gap-x-1 bg-slate-900"
          style={{
            gridTemplateColumns: `repeat(${peers.length}, minmax(0, 1fr))`,
          }}
        >
          {peers.map((peer) => (
            <OpponentSide
              key={peer.info.playerId}
              peer={peer.info}
              view={peer.view}
              seat={peer.seat}
              compact={pod}
              showTurn={turnTracking}
            />
          ))}
        </div>
      )}
      <div className="flex flex-1 min-h-0" onContextMenu={handleContextMenu}>
        <div
          className={classNames(
            'relative flex-1 h-full px-8',
            duel ? 'py-3' : 'py-6'
          )}
        >
          {view && (
            <RevealPanel
              reveal={view.revealed}
              onHide={() =>
                dispatch({ type: 'hideReveal', playerId: view.playerId })
              }
            />
          )}
          {(duel || log.length > 0) && (
            // A corner of the field, not the side panel, which is full in
            // a commander pod; it stays in view for screensharing.
            <div className="absolute bottom-3 right-3 z-10 w-72 rounded-lg bg-slate-900/85 p-2 text-slate-100 shadow-lg">
              <TableLog log={log} onCustomDie={() => setDialog('rollDie')} />
            </div>
          )}
          {/* Positions are relative to this box, in logical field units. */}
          <ScaledField testId="battlefield">
            {(scale) =>
              view &&
              stackOrder(view.zones.battlefield).map((card) => (
                <BattlefieldCard
                  key={card.instanceId}
                  card={card}
                  scale={scale}
                  onAddCounter={onAddCounter}
                  onAttach={onAttach}
                />
              ))
            }
          </ScaledField>
        </div>

        <aside
          style={{ width: SIDE_PANEL_WIDTH }}
          className={classNames(
            'h-full shrink-0 overflow-y-auto bg-slate-800 text-slate-100 flex flex-col p-3',
            duel ? 'gap-2' : 'gap-3'
          )}
        >
          {view && (
            <>
              <LifeCounter
                playerId={view.playerId}
                life={view.life}
                compact={duel}
                onSetLife={() => setDialog('setLife')}
              />
              <PlayerCounters
                counters={view.counters}
                playerId={view.playerId}
              />
              {turnTracking && <TurnPanel view={view} compact={duel} />}
              {!view.keptHand && (
                <div
                  data-testid="mulligan-status"
                  className="rounded bg-amber-200 px-2 py-1 text-center text-sm font-semibold text-slate-900"
                >
                  Choosing opening hand · Mulligans {view.mulligans}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                <ToolButton
                  onClick={() =>
                    dispatch({ type: 'untapAll', playerId: view.playerId })
                  }
                >
                  Untap all
                </ToolButton>
                <ToolButton onClick={() => setDialog('drawMany')}>
                  Draw N…
                </ToolButton>
                <ToolButton onClick={() => setDialog('mill')}>
                  Mill N…
                </ToolButton>
                <ToolButton
                  onClick={() =>
                    dispatch({ type: 'shuffle', playerId: view.playerId })
                  }
                >
                  Shuffle
                </ToolButton>
                <ToolButton onClick={() => setDialog('token')}>
                  Token…
                </ToolButton>
                <UndoButtons className={toolButtonClass} />
                <ToolButton onClick={() => setDialog('restart')}>
                  Restart
                </ToolButton>
                {commanderGame && canAddDummy && !duel && (
                  <ToolButton
                    label="Add placeholder opponent"
                    onClick={addDummy}
                  >
                    + Opponent
                  </ToolButton>
                )}
                <ToolButton label="Keyboard shortcuts" onClick={toggleHelp}>
                  ?
                </ToolButton>
              </div>
              <div
                className={classNames(
                  'grid gap-x-2',
                  compactPiles ? 'grid-cols-4 gap-y-1' : 'grid-cols-2 gap-y-3'
                )}
              >
                <Library
                  playerId={view.playerId}
                  count={view.libraryCount}
                  size={pileSize}
                  onDrawMany={() => setDialog('drawMany')}
                  onMill={() => setDialog('mill')}
                />
                <div
                  data-testid="hand-count"
                  data-drop-zone="hand"
                  data-count={view.handCount}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={classNames(
                      'aspect-card rounded-lg border-2 border-dashed border-slate-500',
                      'flex items-center justify-center font-bold tabular-nums',
                      compactPiles ? 'text-2xl' : 'text-4xl',
                      cardWidths[pileSize]
                    )}
                  >
                    {view.handCount}
                  </div>
                  <div className="text-sm font-medium">
                    Hand <span className="tabular-nums">{view.handCount}</span>
                  </div>
                </div>
                <ZonePile
                  zone="graveyard"
                  label="Graveyard"
                  cards={view.zones.graveyard}
                  size={pileSize}
                  onOpen={() => setDialog('graveyard')}
                />
                <ZonePile
                  zone="exile"
                  label="Exile"
                  cards={view.zones.exile}
                  size={pileSize}
                  onOpen={() => setDialog('exile')}
                />
                {commanderGame && (
                  <CommandZone view={view} size={duel ? 'xs' : 'sm'} />
                )}
              </div>
              <CommanderDamageTaken
                playerId={view.playerId}
                sources={opponentCommanders(peers)}
                taken={view.commanderDamage}
              />
              <DummyOpponents
                playerId={view.playerId}
                dummies={view.dummies}
                commanders={commanderSources(visibleCommanders(view))}
              />
            </>
          )}
        </aside>
      </div>

      {view && dialog === 'graveyard' && (
        <ZoneBrowser
          title="Graveyard"
          cards={view.zones.graveyard}
          onClose={close}
        />
      )}
      {view && dialog === 'exile' && (
        <ZoneBrowser title="Exile" cards={view.zones.exile} onClose={close} />
      )}
      {view && dialog === 'drawMany' && (
        <NumberPrompt
          title="Draw cards"
          label="How many?"
          initial={1}
          min={1}
          max={Math.max(1, view.libraryCount)}
          onSubmit={(count) =>
            dispatch({ type: 'draw', playerId: view.playerId, count })
          }
          onClose={close}
        />
      )}
      {view && dialog === 'mill' && (
        <NumberPrompt
          title="Mill cards"
          label="How many from the top?"
          initial={1}
          min={1}
          max={Math.max(1, view.libraryCount)}
          onSubmit={(count) =>
            dispatch({ type: 'mill', playerId: view.playerId, count })
          }
          onClose={close}
        />
      )}
      {view && dialog === 'setLife' && (
        <NumberPrompt
          title="Set life"
          label="Life total"
          initial={view.life}
          min={-999}
          max={9999}
          onSubmit={(life) =>
            dispatch({ type: 'setLife', playerId: view.playerId, life })
          }
          onClose={close}
        />
      )}
      {dialog === 'restart' && (
        <ConfirmDialog
          title="Restart game?"
          message="Starts a new game with the same deck: everything is shuffled back and you draw a new opening hand."
          confirmLabel="Restart"
          onConfirm={() => {
            window.api.restartPlayTest().catch((err: unknown) => {
              console.error('[play-test] restart failed', err);
            });
          }}
          onClose={close}
        />
      )}
      {dialog === 'help' && <ShortcutHelp onClose={close} />}
      {dialog === 'rollDie' && (
        <NumberPrompt
          title="Roll a die"
          label="Sides"
          initial={100}
          min={2}
          max={MAX_DIE_SIDES}
          onSubmit={(sides) => requestRoll({ type: 'die', sides })}
          onClose={close}
        />
      )}
      {prompts[0] && (
        <CommanderPrompt key={prompts[0].instanceId} prompt={prompts[0]} />
      )}
      {view && dialog === 'token' && (
        <TokenDialog playerId={view.playerId} onClose={close} />
      )}
      {cardDialog?.kind === 'counter' && (
        <CounterDialog card={cardDialog.card} onClose={closeCardDialog} />
      )}
      {view && cardDialog?.kind === 'attach' && (
        <AttachDialog
          card={cardDialog.card}
          battlefield={view.zones.battlefield}
          onClose={closeCardDialog}
        />
      )}
    </div>
  );
};

export default Board;
