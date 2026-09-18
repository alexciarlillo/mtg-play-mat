import type { PublicView } from '@shared/game';
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
import ZoneBrowser from './ZoneBrowser';
import ZonePile from './ZonePile';

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

const Board = ({ store }: { store: ViewStore<PublicView> }) => {
  const view = useView(store);
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

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-neutral-400 flex"
      onContextMenu={handleContextMenu}
    >
      <div className="flex-1 h-full px-8 py-6">
        {/* Positions are relative to this box. */}
        <div data-testid="battlefield" className="relative h-full w-full">
          {view?.zones.battlefield.map((card) => (
            <BattlefieldCard key={card.instanceId} card={card} />
          ))}
        </div>
      </div>

      <aside
        style={{ width: SIDE_PANEL_WIDTH }}
        className="h-full shrink-0 bg-slate-800 text-slate-100 flex flex-col gap-3 p-3"
      >
        {view && (
          <>
            <LifeCounter
              playerId={view.playerId}
              life={view.life}
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
            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
              <Library
                playerId={view.playerId}
                count={view.libraryCount}
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
                    'flex items-center justify-center text-4xl font-bold tabular-nums',
                    cardWidths.sm
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
                onOpen={() => setDialog('graveyard')}
              />
              <ZonePile
                zone="exile"
                label="Exile"
                cards={view.zones.exile}
                onOpen={() => setDialog('exile')}
              />
            </div>
          </>
        )}
      </aside>

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
