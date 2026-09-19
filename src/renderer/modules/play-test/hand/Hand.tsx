import { type CardView, isModalDfc, type PrivateView } from '@shared/game';
import classNames from 'classnames';
import { useCallback, useEffect, useState } from 'react';

import Card from '../../../ui/Card';
import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import { moveMenu, moveTo } from '../common/cardMenus';
import { NumberPrompt } from '../common/Dialogs';
import ShortcutHelp from '../common/ShortcutHelp';
import UndoButtons from '../common/UndoButtons';
import { useGameShortcuts } from '../common/useGameShortcuts';
import { dispatch, useView, type ViewStore } from '../viewStore';
import LookAtTopDialog from './LookAtTopDialog';
import SearchLibraryDialog from './SearchLibraryDialog';

const play = (card: CardView) => moveTo(card, 'battlefield');

const playAs = (
  card: CardView,
  options: { faceDown?: boolean; faceIndex?: number }
) =>
  dispatch({
    type: 'moveCard',
    instanceId: card.instanceId,
    to: 'battlefield',
    ...options,
  });

const revealCard = (card: CardView) =>
  dispatch({
    type: 'reveal',
    playerId: card.owner,
    source: 'card',
    instanceId: card.instanceId,
  });

// Play, discard and the other moves, plus the alternate ways to play:
// face down (morph, manifest), or as the back of a modal DFC.
const handMenu = (card: CardView): ContextMenuSpec[] => {
  const moves = moveMenu(card, { battlefield: 'Play', graveyard: 'Discard' });
  const back = card.ref && isModalDfc(card.ref) ? card.ref.faces[1] : undefined;
  const extras: ContextMenuSpec[] = [
    ...(back
      ? [
          {
            title: `Play as ${back.name}`,
            action: () => playAs(card, { faceIndex: 1 }),
          },
        ]
      : []),
    { title: 'Play face down', action: () => playAs(card, { faceDown: true }) },
    { title: 'Reveal', action: () => revealCard(card) },
  ];
  const at = moves.findIndex((item) => item.title === 'Play') + 1;
  return [...moves.slice(0, at), ...extras, ...moves.slice(at)];
};

// The owner's private look at their face-down permanents. Only the hand
// window has their identities; the board never does.
const FaceDownPeek = ({ cards }: { cards: CardView[] }) => (
  <div
    data-testid="face-down-peek"
    className="flex shrink-0 flex-col gap-1 border-l border-slate-600 pl-3"
  >
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
      Face down ({cards.length})
    </div>
    <div className="flex gap-2">
      {cards.map((card) => (
        <Card key={card.instanceId} card={card} size="sm" reveal />
      ))}
    </div>
  </div>
);

const titleButton =
  'rounded px-1.5 text-xs font-medium hover:bg-slate-300 disabled:opacity-40 [-webkit-app-region:no-drag]';

const revealTitles = {
  hand: 'your hand',
  libraryTop: 'the top of your library',
  card: 'a card from your hand',
};

type Dialog = 'help' | 'lookCount' | 'look' | 'search';

const libraryDialogs: (Dialog | null)[] = ['lookCount', 'look', 'search'];

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
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [lookCount, setLookCount] = useState(3);
  const close = useCallback(() => setDialog(null), []);
  // A look or search belongs to the game it started in.
  useEffect(
    () =>
      window.api.onGameStarted(() =>
        setDialog((open) => (libraryDialogs.includes(open) ? null : open))
      ),
    []
  );
  // Choosing which cards pay for mulligans is a local, uncommitted pick;
  // main only hears about it as one keepHand action.
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const toggleHelp = useCallback(
    () => setDialog((open) => (open === 'help' ? null : 'help')),
    []
  );
  useGameShortcuts(view, { enabled: dialog === null, onHelp: toggleHelp });

  const handIds = new Set(view?.hand.map((card) => card.instanceId));
  const faceDown =
    view?.zones.battlefield.filter((card) => card.faceDown) ?? [];
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
      <div className="flex h-6 w-screen shrink-0 items-center justify-between gap-2 bg-slate-200 px-2 [-webkit-app-region:drag]">
        <div className="flex gap-1">
          <button
            type="button"
            className={titleButton}
            disabled={!view || view.libraryCount === 0}
            onClick={() => setDialog('lookCount')}
          >
            Look at top…
          </button>
          <button
            type="button"
            className={titleButton}
            disabled={!view}
            onClick={() => setDialog('search')}
          >
            Search library…
          </button>
          <button
            type="button"
            className={titleButton}
            disabled={!view || view.hand.length === 0}
            onClick={() =>
              view &&
              dispatch({
                type: 'reveal',
                playerId: view.playerId,
                source: 'hand',
              })
            }
          >
            Reveal hand
          </button>
        </div>
        <span>
          Hand {view ? `(${view.hand.length})` : ''} · Library{' '}
          {view?.libraryCount ?? 0}
        </span>
        <div className="flex gap-1">
          <UndoButtons className={titleButton} />
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            className={`${titleButton} font-bold`}
            onClick={toggleHelp}
          >
            ?
          </button>
        </div>
      </div>
      {view?.revealed && (
        <div
          data-testid="hand-reveal-banner"
          className="flex items-center gap-2 bg-sky-200 px-3 py-0.5 text-sm"
        >
          <span className="font-semibold">
            Everyone can see {revealTitles[view.revealed.source]} (
            {view.revealed.cards.length}). It hides at your next action.
          </span>
          <button
            type="button"
            className={`${barButton} ring-1 ring-slate-600`}
            onClick={() =>
              dispatch({ type: 'hideReveal', playerId: view.playerId })
            }
          >
            Hide
          </button>
        </div>
      )}
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
                menu={selecting ? [] : handMenu(card)}
              />
            </div>
          );
        })}
        {faceDown.length > 0 && <FaceDownPeek cards={faceDown} />}
      </div>
      {dialog === 'help' && <ShortcutHelp onClose={close} />}
      {view && dialog === 'lookCount' && (
        <NumberPrompt
          title="Look at the top of your library"
          label="How many cards?"
          initial={Math.min(lookCount, view.libraryCount)}
          min={1}
          max={Math.max(1, view.libraryCount)}
          onSubmit={(count) => {
            setLookCount(count);
            setDialog('look');
          }}
          // The prompt closes itself after a submit, which must not also
          // close the look it just opened.
          onClose={() =>
            setDialog((open) => (open === 'lookCount' ? null : open))
          }
        />
      )}
      {view && dialog === 'look' && (
        <LookAtTopDialog
          playerId={view.playerId}
          seq={view.seq}
          count={lookCount}
          onClose={close}
        />
      )}
      {view && dialog === 'search' && (
        <SearchLibraryDialog
          playerId={view.playerId}
          seq={view.seq}
          onClose={close}
        />
      )}
    </div>
  );
};

export default Hand;
