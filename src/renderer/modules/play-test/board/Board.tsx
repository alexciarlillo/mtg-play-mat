import type { PublicView } from '@shared/game';
import type { OpponentState } from '@shared/net/remoteViews';
import classNames from 'classnames';
import { type MouseEvent, type ReactNode, useCallback, useState } from 'react';

import { cardWidths } from '../../../ui/cardSizes';
import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { ConfirmDialog, NumberPrompt } from '../common/Dialogs';
import ShortcutHelp from '../common/ShortcutHelp';
import { useGameShortcuts } from '../common/useGameShortcuts';
import { dispatch, useView, type ViewStore } from '../viewStore';
import BattlefieldCard from './BattlefieldCard';
import Library from './Library';
import { SIDE_PANEL_WIDTH } from './layout';
import LifeCounter from './LifeCounter';
import OpponentSide from './OpponentSide';
import ScaledField from './ScaledField';
import ZoneBrowser from './ZoneBrowser';
import ZonePile from './ZonePile';

const noOpponent: ViewStore<OpponentState> = {
  subscribe: () => () => {},
  getSnapshot: () => null,
};

type Dialog =
  'help' | 'drawMany' | 'setLife' | 'restart' | 'graveyard' | 'exile';

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
    className="rounded bg-slate-700 px-2 py-1 text-sm font-medium text-white hover:bg-slate-600"
    onClick={onClick}
  >
    {children}
  </button>
);

interface Props {
  store: ViewStore<PublicView>;
  opponent?: ViewStore<OpponentState>;
}

const Board = ({ store, opponent }: Props) => {
  const view = useView(store);
  const remote = useView(opponent ?? noOpponent);
  const peer = remote?.peer ?? null;
  // With an opponent the board splits in two and the own panel compacts.
  const duel = peer !== null;
  const menu = useContextMenu();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const toggleHelp = useCallback(
    () => setDialog((open) => (open === 'help' ? null : 'help')),
    []
  );

  useGameShortcuts(view, { enabled: dialog === null, onHelp: toggleHelp });

  const playerId = view?.playerId;

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const inDialog = (e.target as Element).closest('[role="dialog"]');
    if (!playerId || inDialog) return;
    menu.open({
      specs: [
        {
          title: 'Draw a card',
          action: () => dispatch({ type: 'draw', playerId, count: 1 }),
        },
        { title: 'Draw N…', action: () => setDialog('drawMany') },
        {
          title: 'Untap all',
          action: () => dispatch({ type: 'untapAll', playerId }),
        },
        {
          title: 'Shuffle library',
          action: () => dispatch({ type: 'shuffle', playerId }),
        },
        { title: 'Keyboard shortcuts', action: () => setDialog('help') },
      ],
      x: e.pageX,
      y: e.pageY,
    });
  };

  const pileSize = duel ? 'xs' : 'sm';

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-400 flex flex-col">
      {peer && (
        <div className="h-1/2 min-h-0">
          <OpponentSide peer={peer} view={remote?.view ?? null} />
        </div>
      )}
      <div className="flex flex-1 min-h-0" onContextMenu={handleContextMenu}>
        <div
          className={classNames('flex-1 h-full px-8', duel ? 'py-3' : 'py-6')}
        >
          {/* Positions are relative to this box, in logical field units. */}
          <ScaledField testId="battlefield">
            {(scale) =>
              view?.zones.battlefield.map((card) => (
                <BattlefieldCard
                  key={card.instanceId}
                  card={card}
                  scale={scale}
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
                <ToolButton
                  onClick={() =>
                    dispatch({ type: 'shuffle', playerId: view.playerId })
                  }
                >
                  Shuffle
                </ToolButton>
                <ToolButton onClick={() => setDialog('restart')}>
                  Restart
                </ToolButton>
                <ToolButton label="Keyboard shortcuts" onClick={toggleHelp}>
                  ?
                </ToolButton>
              </div>
              <div
                className={classNames(
                  'grid gap-x-2',
                  duel ? 'grid-cols-4 gap-y-1' : 'grid-cols-2 gap-y-3'
                )}
              >
                <Library
                  playerId={view.playerId}
                  count={view.libraryCount}
                  size={pileSize}
                  onDrawMany={() => setDialog('drawMany')}
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
                      duel ? 'text-2xl' : 'text-4xl',
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
              </div>
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
    </div>
  );
};

export default Board;
