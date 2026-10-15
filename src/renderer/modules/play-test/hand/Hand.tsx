import {
  type CardView,
  isModalDfc,
  type PrivateView,
  type RevealView,
} from '@shared/game';
import type { HandCommand } from '@shared/types/playTest';
import classNames from 'classnames';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import useSettings from '../../../hooks/useSettings';
import Card from '../../../ui/Card';
import type { ContextMenuSpec } from '../../../ui/ContextMenuStore';
import type { HoverKey } from '../../../ui/hoverKeys';
import { moveMenu, moveTo } from '../common/cardMenus';
import { RestartDialog } from '../common/Dialogs';
import { handHoverAction } from '../common/hoverActions';
import LibraryPositionPrompt from '../common/LibraryPositionPrompt';
import ShortcutHelp from '../common/ShortcutHelp';
import UndoButtons from '../common/UndoButtons';
import {
  type LibraryDialog,
  useGameShortcuts,
} from '../common/useGameShortcuts';
import { dispatch, useView, type ViewStore } from '../viewStore';
import BottomCardDialog from './BottomCardDialog';
import LookAtTopDialog from './LookAtTopDialog';
import LookPrompt, { type LookChoice } from './LookPrompt';
import SearchLibraryDialog from './SearchLibraryDialog';

const play = (card: CardView) => moveTo(card, 'battlefield');

const onHandKey = (card: CardView, key: HoverKey) => {
  const action = handHoverAction(card, key);
  if (action) dispatch(action);
};

const playAs = (
  card: CardView,
  options: { faceDown?: boolean; faceIndex?: number; tapped?: boolean }
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

type LibraryEnd = 'top' | 'bottom';

interface HandMenuOptions {
  onPutInLibrary(card: CardView): void;
  // Left out until the opening hand is kept.
  onPutBack?(card: CardView, end: LibraryEnd): void;
}

// Play, discard and the other moves, plus the alternate ways to play:
// tapped, face down (morph, manifest), or as the back of a modal DFC.
const handMenu = (
  card: CardView,
  { onPutInLibrary, onPutBack }: HandMenuOptions
): ContextMenuSpec[] => {
  const moves = moveMenu(
    card,
    { battlefield: 'Play', graveyard: 'Discard' },
    { onPutInLibrary }
  );
  const back = card.ref && isModalDfc(card.ref) ? card.ref.faces[1] : undefined;
  const extras: ContextMenuSpec[] = [
    { title: 'Play tapped', action: () => playAs(card, { tapped: true }) },
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
  const putBack: ContextMenuSpec[] = onPutBack
    ? [
        { title: 'Put cards on top…', action: () => onPutBack(card, 'top') },
        {
          title: 'Put cards on the bottom…',
          action: () => onPutBack(card, 'bottom'),
        },
      ]
    : [];
  const at = moves.findIndex((item) => item.title === 'Play') + 1;
  return [...moves.slice(0, at), ...extras, ...moves.slice(at), ...putBack];
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

type Dialog = 'help' | 'lookCount' | 'look' | 'search' | 'bottom' | 'restart';

const libraryDialogOf: Record<LibraryDialog, Dialog> = {
  search: 'search',
  look: 'lookCount',
};

const commandDialogs: Record<HandCommand, Dialog> = {
  viewBottom: 'bottom',
  ...libraryDialogOf,
};

const libraryDialogs: (Dialog | null)[] = [
  'lookCount',
  'look',
  'search',
  'bottom',
];

type PickMode = 'mulligan' | LibraryEnd;

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

interface PutBackBarProps {
  end: LibraryEnd;
  count: number;
  onConfirm(): void;
  onCancel(): void;
}

// Picks are numbered in click order, which is the order they go in.
const putBackHint: Record<LibraryEnd, string> = {
  top: 'Click cards in order: 1 ends up on top',
  bottom: 'Click cards in order: the last ends up at the very bottom',
};

const PutBackBar = ({ end, count, onConfirm, onCancel }: PutBackBarProps) => (
  <div data-testid="put-back-bar" className={mulliganBar}>
    <span className="font-semibold">
      {putBackHint[end]} ({count})
    </span>
    <button
      type="button"
      className={`${mulliganButton} bg-slate-800 text-white`}
      disabled={count === 0}
      onClick={onConfirm}
    >
      Put {count} on {end === 'top' ? 'top' : 'the bottom'}
    </button>
    <button
      type="button"
      className={`${mulliganButton} ring-1 ring-slate-600`}
      onClick={onCancel}
    >
      Cancel
    </button>
  </div>
);

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
  // The card a "Put Xth from top" prompt is open for.
  const [placing, setPlacing] = useState<CardView | null>(null);
  const busy = dialog !== null || placing !== null;
  // Read by the board's commands, which arrive outside any render.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
    onBusyChange.current?.(busy);
  }, [busy]);
  useEffect(() => () => onBusyChange.current?.(false), []);
  const [look, setLook] = useState<LookChoice>({
    preset: 'look',
    count: 3,
    take: 1,
  });
  const close = useCallback(() => setDialog(null), []);
  // Opens a dialog unless one is already open, which may be mid-look.
  const openDialog = useCallback(
    (next: Dialog) => setDialog((open) => open ?? next),
    []
  );
  // The board asks for library dialogs here, since only this window may
  // see the library. Never over a prompt, which Escape would close too.
  useEffect(
    () =>
      window.api.onHandCommand((command) => {
        const next = commandDialogs[command] as Dialog | undefined;
        if (next && !busyRef.current) openDialog(next);
      }),
    [openDialog]
  );
  // Choosing which cards pay for mulligans, or go back into the library,
  // is a local, uncommitted pick; main only hears about it as one action.
  const [pickMode, setPickMode] = useState<PickMode | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // A look, search or pick belongs to the game it started in.
  useEffect(
    () =>
      window.api.onGameStarted(() => {
        setDialog((open) => (libraryDialogs.includes(open) ? null : open));
        setPlacing(null);
        setPickMode((mode) => (mode === 'mulligan' ? mode : null));
        // Instance ids repeat from game to game.
        setPicked([]);
      }),
    []
  );
  // Putting back waits for a kept hand, so it never hides the mulligan.
  const kept = view?.keptHand ?? false;
  const putBackEnd = pickMode === 'mulligan' || !kept ? null : pickMode;
  const [wasKept, setWasKept] = useState(kept);
  if (wasKept !== kept) {
    setWasKept(kept);
    if (!kept && pickMode !== 'mulligan') setPickMode(null);
  }
  useEffect(() => {
    if (!putBackEnd) return undefined;
    // Docked, a board dialog or menu may own this Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      setPickMode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [putBackEnd]);

  const toggleHelp = useCallback(
    () =>
      setDialog((open) => {
        if (open === 'help') return null;
        return open ?? 'help';
      }),
    []
  );
  const { turnTracking } = useSettings().settings;
  // Docked, the board window's own shortcuts already cover the keys.
  useGameShortcuts(view, {
    enabled: !busy,
    onHelp: toggleHelp,
    onRestart: () => openDialog('restart'),
    onLibraryDialog: (kind) => openDialog(libraryDialogOf[kind]),
    turnTracking,
    listen: !docked,
  });

  const handIds = new Set(view?.hand.map((card) => card.instanceId));
  const faceDown =
    view?.zones.battlefield.filter((card) => card.faceDown) ?? [];
  const chosen = picked.filter((id) => handIds.has(id));
  const selecting = Boolean(
    view && (putBackEnd !== null || (!view.keptHand && pickMode === 'mulligan'))
  );

  const keep = () => {
    if (!view) return;
    if (view.mulligans === 0 || view.hand.length === 0) {
      dispatch({ type: 'keepHand', playerId: view.playerId, bottom: [] });
    } else {
      setPicked([]);
      setPickMode('mulligan');
    }
  };

  const confirm = () => {
    if (!view) return;
    dispatch({ type: 'keepHand', playerId: view.playerId, bottom: chosen });
    setPickMode(null);
    setPicked([]);
  };

  const startPutBack = (card: CardView, end: LibraryEnd) => {
    setPicked([card.instanceId]);
    setPickMode(end);
  };

  const putBack = () => {
    if (!view || !putBackEnd || chosen.length === 0) return;
    dispatch({
      type: 'putFromHand',
      playerId: view.playerId,
      top: putBackEnd === 'top' ? chosen : [],
      bottom: putBackEnd === 'bottom' ? chosen : [],
    });
    setPickMode(null);
    setPicked([]);
  };

  const togglePick = (card: CardView) => {
    if (!view) return;
    const limit = putBackEnd
      ? Infinity
      : Math.min(view.mulligans, view.hand.length);
    setPicked((current) => {
      const live = current.filter((id) => handIds.has(id));
      if (live.includes(card.instanceId)) {
        return live.filter((id) => id !== card.instanceId);
      }
      return live.length < limit ? [...live, card.instanceId] : live;
    });
  };

  const menuOptions: HandMenuOptions = {
    onPutInLibrary: setPlacing,
    onPutBack: kept ? startPutBack : undefined,
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
          {!dock?.collapsed && putBackEnd && (
            <PutBackBar
              end={putBackEnd}
              count={chosen.length}
              onConfirm={putBack}
              onCancel={() => setPickMode(null)}
            />
          )}
          {!dock?.collapsed && view && !view.keptHand && !putBackEnd && (
            <MulliganBar
              view={view}
              choosing={selecting}
              chosen={chosen}
              onKeep={keep}
              onConfirm={confirm}
              onCancel={() => setPickMode(null)}
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
            const order = selecting ? chosen.indexOf(card.instanceId) : -1;
            const isPicked = order >= 0;
            const face = (
              <Card
                card={card}
                size="md"
                onClick={selecting ? togglePick : play}
                menu={selecting ? [] : handMenu(card, menuOptions)}
                onHoverKey={
                  selecting ? undefined : (key) => onHandKey(card, key)
                }
              />
            );
            return (
              <div
                key={card.instanceId}
                className={classNames(
                  'relative shrink-0 rounded-lg transition',
                  {
                    'outline-4 outline-sky-400 translate-y-1 opacity-70':
                      isPicked,
                  }
                )}
              >
                {dock && !selecting ? dock.wrapCard(card, face) : face}
                {isPicked && (
                  <span
                    data-testid="pick-number"
                    className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600 px-3 py-1 text-lg font-bold text-white shadow-lg"
                  >
                    {order + 1}
                  </span>
                )}
              </div>
            );
          })}
          {faceDown.length > 0 && <FaceDownPeek cards={faceDown} />}
        </div>
      )}
      {dialog === 'help' && <ShortcutHelp onClose={close} />}
      {dialog === 'restart' && <RestartDialog onClose={close} />}
      {view && placing && (
        <LibraryPositionPrompt
          card={placing}
          libraryCount={view.libraryCount}
          onClose={() => setPlacing(null)}
        />
      )}
      {view && dialog === 'lookCount' && (
        <LookPrompt
          initial={{ ...look, count: Math.min(look.count, view.libraryCount) }}
          max={Math.max(1, view.libraryCount)}
          onSubmit={(choice) => {
            setLook(choice);
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
          count={look.count}
          preset={look.preset}
          take={look.take}
          onPresetChange={(preset) => setLook((was) => ({ ...was, preset }))}
          onClose={close}
        />
      )}
      {view && dialog === 'bottom' && (
        <BottomCardDialog seq={view.seq} onClose={close} />
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
