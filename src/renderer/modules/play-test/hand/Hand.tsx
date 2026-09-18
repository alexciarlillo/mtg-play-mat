import type { CardView, PrivateView } from '@shared/game';
import classNames from 'classnames';
import { useCallback, useState } from 'react';

import Card from '../../../ui/Card';
import { moveMenu, moveTo } from '../common/cardMenus';
import ShortcutHelp from '../common/ShortcutHelp';
import { useGameShortcuts } from '../common/useGameShortcuts';
import { dispatch, useView, type ViewStore } from '../viewStore';

const play = (card: CardView) => moveTo(card, 'battlefield');

const barButton =
  'rounded px-3 py-0.5 text-sm font-semibold disabled:opacity-40 [-webkit-app-region:no-drag]';

interface MulliganBarProps {
  view: PrivateView;
  choosing: boolean;
  chosen: string[];
  onKeep(): void;
  onConfirm(): void;
  onCancel(): void;
}

const MulliganBar = ({
  view,
  choosing,
  chosen,
  onKeep,
  onConfirm,
  onCancel,
}: MulliganBarProps) => {
  const owed = Math.min(view.mulligans, view.hand.length);

  if (choosing) {
    return (
      <div
        data-testid="mulligan-bar"
        className="flex items-center gap-2 bg-amber-200 px-3 py-1 text-sm"
      >
        <span className="font-semibold">
          Choose {owed} card{owed === 1 ? '' : 's'} to put on the bottom (
          {chosen.length}/{owed})
        </span>
        <button
          type="button"
          className={`${barButton} bg-slate-800 text-white`}
          disabled={chosen.length !== owed}
          onClick={onConfirm}
        >
          Bottom and keep
        </button>
        <button
          type="button"
          className={`${barButton} ring-1 ring-slate-600`}
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="mulligan-bar"
      className="flex items-center gap-2 bg-amber-200 px-3 py-1 text-sm"
    >
      <span className="font-semibold">
        Opening hand · Mulligans {view.mulligans}
      </span>
      <button
        type="button"
        className={`${barButton} bg-emerald-700 text-white`}
        onClick={onKeep}
      >
        Keep
      </button>
      <button
        type="button"
        className={`${barButton} bg-slate-800 text-white`}
        onClick={() => dispatch({ type: 'mulligan', playerId: view.playerId })}
      >
        Mulligan
      </button>
    </div>
  );
};

const Hand = ({ store }: { store: ViewStore<PrivateView> }) => {
  const view = useView(store);
  const [helpOpen, setHelpOpen] = useState(false);
  // Choosing which cards pay for mulligans is a local, uncommitted pick;
  // main only hears about it as one keepHand action.
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  useGameShortcuts(view, { enabled: !helpOpen, onHelp: toggleHelp });

  const handIds = new Set(view?.hand.map((card) => card.instanceId));
  const chosen = picked.filter((id) => handIds.has(id));
  const selecting = Boolean(view && !view.keptHand && choosing);

  const keep = () => {
    if (!view) return;
    if (view.mulligans === 0 || view.hand.length === 0) {
      dispatch({ type: 'keepHand', playerId: view.playerId, bottom: [] });
    } else {
      setPicked([]);
      setChoosing(true);
    }
  };

  const confirm = () => {
    if (!view) return;
    dispatch({ type: 'keepHand', playerId: view.playerId, bottom: chosen });
    setChoosing(false);
    setPicked([]);
  };

  const togglePick = (card: CardView) => {
    if (!view) return;
    const owed = Math.min(view.mulligans, view.hand.length);
    setPicked((current) => {
      const live = current.filter((id) => handIds.has(id));
      if (live.includes(card.instanceId)) {
        return live.filter((id) => id !== card.instanceId);
      }
      return live.length < owed ? [...live, card.instanceId] : live;
    });
  };

  return (
    <div className="h-full w-screen bg-slate-800 flex flex-col">
      <div className="relative w-screen h-6 shrink-0 text-center bg-slate-200 [-webkit-app-region:drag]">
        Hand {view ? `(${view.hand.length})` : ''} · Library{' '}
        {view?.libraryCount ?? 0}
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          className="absolute right-2 top-0 px-2 font-bold [-webkit-app-region:no-drag]"
          onClick={toggleHelp}
        >
          ?
        </button>
      </div>
      {view && !view.keptHand && (
        <MulliganBar
          view={view}
          choosing={selecting}
          chosen={chosen}
          onKeep={keep}
          onConfirm={confirm}
          onCancel={() => setChoosing(false)}
        />
      )}
      <div
        data-testid="hand"
        className="flex flex-1 items-start gap-2 overflow-x-auto px-3 py-2"
      >
        {view?.hand.map((card) => {
          const isPicked = selecting && chosen.includes(card.instanceId);
          return (
            <div
              key={card.instanceId}
              className={classNames('shrink-0 rounded-lg transition', {
                'outline-4 outline-sky-400 translate-y-1 opacity-70': isPicked,
              })}
            >
              <Card
                card={card}
                size="md"
                onClick={selecting ? togglePick : play}
                menu={
                  selecting
                    ? []
                    : moveMenu(card, {
                        battlefield: 'Play',
                        graveyard: 'Discard',
                      })
                }
              />
            </div>
          );
        })}
      </div>
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

export default Hand;
