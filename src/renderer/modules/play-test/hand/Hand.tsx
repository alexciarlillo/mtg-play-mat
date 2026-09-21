import {
  type CardView,
  isModalDfc,
  type PrivateView,
  type RevealView,
} from '@shared/game';
import classNames from 'classnames';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

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

const mulliganButton =
  'rounded px-2 text-xs font-semibold disabled:opacity-40 [-webkit-app-region:no-drag]';

const mulliganBar =
  'flex shrink-0 items-center gap-2 whitespace-nowrap rounded bg-amber-200 px-2 py-0.5 text-xs';

interface MulliganBarProps {
  view: PrivateView;
  choosing: boolean;
  chosen: string[];
  onKeep(): void;
  onConfirm(): void;
  onCancel(): void;
}

// The mulligan controls sit in the title bar rather than in a strip of
// their own so the cards never move while the player is reading the hand
// they are deciding on.
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
      <div data-testid="mulligan-bar" className={mulliganBar}>
        <span className="font-semibold">
          Choose {owed} card{owed === 1 ? '' : 's'} to put on the bottom (
          {chosen.length}/{owed})
        </span>
        <button
          type="button"
          className={`${mulliganButton} bg-slate-800 text-white`}
          disabled={chosen.length !== owed}
          onClick={onConfirm}
        >
          Bottom and keep
        </button>
        <button
          type="button"
          className={`${mulliganButton} ring-1 ring-slate-600`}
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div data-testid="mulligan-bar" className={mulliganBar}>
      <span className="font-semibold">
        Opening hand · Mulligans {view.mulligans}
      </span>
      <button
        type="button"
        className={`${mulliganButton} bg-emerald-700 text-white`}
        onClick={onKeep}
      >
        Keep
      </button>
      <button
        type="button"
        className={`${mulliganButton} bg-slate-800 text-white`}
        onClick={() => dispatch({ type: 'mulligan', playerId: view.playerId })}
      >
        Mulligan
      </button>
    </div>
  );
};

// Beside the mulligan controls, and for the same reason: a strip of its
// own pushed the cards down every time something was revealed, and the
// tray has no height to lose.
const RevealBar = ({
  view,
  reveal,
}: {
  view: PrivateView;
  reveal: RevealView;
}) => (
  <div
    data-testid="hand-reveal-banner"
    className="flex min-w-0 items-center gap-2 rounded bg-sky-200 px-2 py-0.5 text-xs"
  >
    <span className="truncate font-semibold">
      Everyone can see {revealTitles[reveal.source]} ({reveal.cards.length}). It
      hides at your next action.
    </span>
    <button
      type="button"
      className={`${mulliganButton} shrink-0 ring-1 ring-slate-600`}
      onClick={() => dispatch({ type: 'hideReveal', playerId: view.playerId })}
    >
      Hide
    </button>
  </div>
);

// How the hand behaves when docked in the board window rather than in a
// window of its own.
export interface HandDock {
  collapsed: boolean;
  // More title bar controls, such as the tray's collapse toggle.
  controls: ReactNode;
  // The board holds its game keys while one of the hand's dialogs is open.
  onBusyChange(busy: boolean): void;
  // Lets the board make each card draggable onto the battlefield.
  wrapCard(card: CardView, node: ReactNode): ReactNode;
}

interface Props {
  store: ViewStore<PrivateView>;
  dock?: HandDock;
}

const Hand = ({ store, dock }: Props) => {
  const view = useView(store);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const docked = dock !== undefined;
  const onBusyChange = useRef(dock?.onBusyChange);
  useEffect(() => {
    onBusyChange.current = dock?.onBusyChange;
  });
  const busy = dialog !== null;
  useEffect(() => {
    onBusyChange.current?.(busy);
  }, [busy]);
  useEffect(() => () => onBusyChange.current?.(false), []);
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
  // Docked, the board window's own shortcuts already cover the keys.
  useGameShortcuts(view, {
    enabled: dialog === null,
    onHelp: toggleHelp,
    listen: !docked,
  });

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
    <div
      className={classNames(
        'h-full bg-slate-800 flex flex-col',
        docked ? 'w-full' : 'w-screen'
      )}
    >
      <div
        data-testid="hand-title"
        className={classNames(
          'flex h-6 w-full shrink-0 items-center justify-between gap-2 bg-slate-200 px-2',
          { '[-webkit-app-region:drag]': !docked }
        )}
      >
        <div className="flex shrink-0 gap-1">
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
        <div className="flex min-w-0 items-center gap-2">
          {!dock?.collapsed && view?.revealed && (
            <RevealBar view={view} reveal={view.revealed} />
          )}
          {!dock?.collapsed && view && !view.keptHand && (
            <MulliganBar
              view={view}
              choosing={selecting}
              chosen={chosen}
              onKeep={keep}
              onConfirm={confirm}
              onCancel={() => setChoosing(false)}
            />
          )}
          <span className="truncate">
            Hand {view ? `(${view.hand.length})` : ''} · Library{' '}
            {view?.libraryCount ?? 0}
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          <UndoButtons className={titleButton} />
          {!docked && (
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              className={`${titleButton} font-bold`}
              onClick={toggleHelp}
            >
              ?
            </button>
          )}
          {dock?.controls}
        </div>
      </div>
      {!dock?.collapsed && (
        <div
          data-testid="hand"
          className={classNames(
            'flex flex-1 items-start gap-2 overflow-x-auto px-3 py-2',
            { 'min-h-0': docked }
          )}
        >
          {view?.hand.map((card) => {
            const isPicked = selecting && chosen.includes(card.instanceId);
            const face = (
              <Card
                card={card}
                size="md"
                onClick={selecting ? togglePick : play}
                menu={selecting ? [] : handMenu(card)}
              />
            );
            return (
              <div
                key={card.instanceId}
                className={classNames('shrink-0 rounded-lg transition', {
                  'outline-4 outline-sky-400 translate-y-1 opacity-70':
                    isPicked,
                })}
              >
                {dock && !selecting ? dock.wrapCard(card, face) : face}
              </div>
            );
          })}
          {faceDown.length > 0 && <FaceDownPeek cards={faceDown} />}
        </div>
      )}
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
