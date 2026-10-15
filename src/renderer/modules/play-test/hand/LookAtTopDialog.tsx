import type { CardView, PlayerId } from '@shared/game';
import classNames from 'classnames';
import {
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import Card from '../../../ui/Card';
import { useCardPreview } from '../../../ui/CardPreview';
import { Modal } from '../common/Dialogs';
import { useLibraryActivity } from '../common/useLibraryActivity';
import { dispatch } from '../viewStore';
import { keepFocusOnClick, ownsKey } from './dialogKeys';
import {
  type Arrangement,
  applyPreset,
  defaultLane,
  dropIndex,
  flatten,
  initialArrangement,
  type Lane,
  laneHints,
  laneKeys,
  laneNames,
  laneOf,
  lanes,
  moveCard,
  type Preset,
  presetById,
  type PresetId,
  presets,
  restToBottom,
  shiftCard,
  titleFor,
  toAction,
} from './lookLanes';
import { useLibrary } from './useLibrary';

// Below this the dialog shows names instead of card images, so every
// lane still fits in the short hand window.
const ROOMY_HEIGHT = 600;

// Movement under this many pixels is a click (focus), not a drag.
const DRAG_SLOP = 4;

const button =
  'rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400 disabled:opacity-40';

const tileId = (instanceId: string) => `look-tile-${instanceId}`;

const oneClickLabels: Record<Lane, string> = {
  top: 'Keep on top',
  bottom: 'Bottom',
  graveyard: 'Graveyard',
  exile: 'Exile',
  hand: 'Hand',
};

interface Plan {
  // The looked-at cards this plan is for, so a changed library starts a
  // fresh one instead of applying a stale plan.
  key: string;
  arrangement: Arrangement;
  // Cards the player has put somewhere; "rest to bottom" leaves them be.
  placed: string[];
}

interface DragState {
  id: string;
  pointerId: number;
  start: { x: number; y: number };
  at: { x: number; y: number } | null;
}

interface TileProps {
  card: CardView;
  lane: Lane;
  focused: boolean;
  roomy: boolean;
  dragging: boolean;
  onFocus(): void;
  onDragStart(e: PointerEvent<HTMLDivElement>): void;
}

const LookTile = ({
  card,
  lane,
  focused,
  roomy,
  dragging,
  onFocus,
  onDragStart,
}: TileProps) => {
  const preview = useCardPreview();
  const name = card.ref?.name ?? 'Unknown card';
  const { instanceId } = card;
  // A tile that moves or closes while hovered never gets mouseleave.
  useEffect(() => () => preview.hide(instanceId), [preview, instanceId]);
  return (
    <div
      id={tileId(instanceId)}
      role="option"
      aria-selected={focused}
      data-testid="look-card"
      data-look-tile={card.instanceId}
      data-instance-id={card.instanceId}
      data-card-name={card.ref?.name}
      data-dest={lane}
      data-focused={focused || undefined}
      aria-label={name}
      className={classNames(
        'shrink-0 touch-none select-none rounded-lg',
        focused && 'outline-3 outline-offset-1 outline-sky-500',
        dragging && 'opacity-30'
      )}
      onPointerDown={onDragStart}
      onClick={onFocus}
      onMouseEnter={roomy ? undefined : (e) => preview.show(card, e.clientX)}
      onMouseLeave={roomy ? undefined : () => preview.hide(card.instanceId)}
    >
      {roomy ? (
        <Card card={card} size="xs" />
      ) : (
        <div className="max-w-44 cursor-grab truncate rounded bg-white px-2 py-0.5 text-sm font-medium ring-1 ring-slate-400">
          {name}
        </div>
      )}
    </div>
  );
};

interface Props {
  playerId: PlayerId;
  seq: number;
  count: number;
  preset: PresetId;
  // How many cards a "look and take" puts into the hand, at most.
  take: number;
  onPresetChange?(preset: PresetId): void;
  onClose(): void;
}

// A private look at the top of the library (scry, surveil, and so on).
// Nothing is applied until Confirm, which is a single action.
const LookAtTopDialog = ({
  playerId,
  seq,
  count,
  preset: initialPreset,
  take,
  onPresetChange,
  onClose,
}: Props) => {
  useLibraryActivity({ kind: 'look', count });
  const library = useLibrary(seq);
  const top = library?.slice(0, count) ?? [];
  const byId = new Map(top.map((card) => [card.instanceId, card]));
  const key = top.map((card) => card.instanceId).join(' ');

  const [presetId, setPresetId] = useState(initialPreset);
  const preset = presetById(presetId);
  const [saved, setSaved] = useState<Plan | null>(null);
  const plan: Plan =
    saved?.key === key
      ? saved
      : {
          key,
          arrangement: initialArrangement(
            top.map((card) => card.instanceId),
            preset
          ),
          placed: [],
        };
  const { arrangement } = plan;
  const order = flatten(arrangement);

  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = focusId && order.includes(focusId) ? focusId : order[0];
  const [bottomRandom, setBottomRandom] = useState(false);
  const [shuffleAfter, setShuffleAfter] = useState(false);
  const [roomy] = useState(() => window.innerHeight >= ROOMY_HEIGHT);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropLane, setDropLane] = useState<Lane | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const preview = useCardPreview();

  const shown = lanes.filter((lane) => preset.lanes.includes(lane));
  const tooMany = preset.takes === true && arrangement.hand.length > take;
  const canConfirm = order.length > 0 && !tooMany;
  const single = order.length === 1;

  const update = (next: Arrangement, placedId?: string) =>
    setSaved({
      key,
      arrangement: next,
      placed:
        placedId && !plan.placed.includes(placedId)
          ? [...plan.placed, placedId]
          : plan.placed,
    });

  // Returns whether the card was placed; a full hand refuses it.
  const sendTo = (id: string, lane: Lane, index?: number): boolean => {
    if (!preset.lanes.includes(lane)) return false;
    const from = laneOf(arrangement, id);
    if (
      lane === 'hand' &&
      from !== 'hand' &&
      preset.takes &&
      arrangement.hand.length >= take
    ) {
      return false;
    }
    update(
      from === lane && index === undefined
        ? arrangement
        : moveCard(arrangement, id, lane, index),
      id
    );
    setFocusId(id);
    return true;
  };

  const choosePreset = (id: PresetId) => {
    const next = presetById(id);
    setPresetId(id);
    onPresetChange?.(id);
    update(applyPreset(arrangement, next));
    if (!next.shuffles) setShuffleAfter(false);
    if (!next.lanes.includes('bottom')) setBottomRandom(false);
  };

  const confirmWith = (next: Arrangement) => {
    const action = toAction(next, playerId, { bottomRandom, shuffleAfter });
    dispatch(action);
    onClose();
  };

  const confirm = () => {
    if (canConfirm) confirmWith(arrangement);
  };

  // One card needs no arranging: a lane button applies it straight away.
  const sendSingle = (lane: Lane) => {
    const id = order[0];
    if (!id || !preset.lanes.includes(lane)) return;
    confirmWith(moveCard(arrangement, id, lane));
  };

  const shuffleSingle = () => {
    const id = order[0];
    if (!id) return;
    dispatch(
      toAction(moveCard(arrangement, id, 'top'), playerId, {
        bottomRandom: false,
        shuffleAfter: true,
      })
    );
    onClose();
  };

  const onKey = (e: KeyboardEvent) => {
    if (ownsKey(e.target, e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const at = focused ? order.indexOf(focused) : -1;
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const by = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey && focused) {
        update(shiftCard(arrangement, focused, by), focused);
        setFocusId(focused);
      } else if (order.length > 0) {
        setFocusId(order[Math.max(0, Math.min(order.length - 1, at + by))]!);
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'r' && preset.lanes.includes('bottom')) {
      update(restToBottom(arrangement, new Set(plan.placed)));
      return;
    }
    if (key === 's' && preset.shuffles) {
      if (single) shuffleSingle();
      else setShuffleAfter((on) => !on);
      return;
    }
    const lane = lanes.find((l) => laneKeys[l] === key);
    if (!lane || !focused) return;
    e.preventDefault();
    if (single) sendSingle(lane);
    else if (sendTo(focused, lane)) {
      // Move on to the card that was next, so B, B bottoms two in a row.
      const next = order[at + 1] ?? order[at - 1];
      if (next) setFocusId(next);
    }
  };

  const keyHandler = useRef(onKey);
  useLayoutEffect(() => {
    keyHandler.current = onKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Whatever opened the dialog may still hold focus, and a focused button
  // would swallow Enter. The cards take it once they have loaded.
  const hasLanes = !single && order.length > 0;
  const takeFocus = () => (lanesRef.current ?? body.current)?.focus();
  useEffect(() => {
    (lanesRef.current ?? body.current)?.focus();
  }, [hasLanes]);

  useEffect(() => {
    if (!focused) return;
    document
      .getElementById(tileId(focused))
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [focused]);

  const laneAt = (x: number, y: number): HTMLElement | null => {
    const hit = document
      .elementsFromPoint?.(x, y)
      .find((el) => el instanceof HTMLElement && el.dataset.lane);
    return (hit as HTMLElement | undefined) ?? null;
  };

  // Capturing on press keeps a fast flick that ends outside the dialog
  // from leaving a drag behind; a click still lands on the tile.
  const startDrag = (id: string) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      id,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      at: null,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (e.buttons === 0) {
      cancelDrag();
      return;
    }
    const moved =
      Math.abs(e.clientX - drag.start.x) > DRAG_SLOP ||
      Math.abs(e.clientY - drag.start.y) > DRAG_SLOP;
    if (!drag.at && !moved) return;
    if (!drag.at) preview.hide(drag.id);
    setDrag({ ...drag, at: { x: e.clientX, y: e.clientY } });
    const lane = laneAt(e.clientX, e.clientY)?.dataset.lane as Lane;
    setDropLane(lane ?? null);
  };

  const cancelDrag = () => {
    setDrag(null);
    setDropLane(null);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    setDropLane(null);
    if (!drag.at) return;
    const target = laneAt(e.clientX, e.clientY);
    const lane = target?.dataset.lane as Lane | undefined;
    if (!target || !lane) return;
    const others = [
      ...target.querySelectorAll<HTMLElement>('[data-look-tile]'),
    ].filter((el) => el.dataset.lookTile !== drag.id);
    const index = dropIndex(
      others.map((el) => el.getBoundingClientRect()),
      e.clientX,
      e.clientY
    );
    sendTo(drag.id, lane, index);
  };

  const dragged = drag?.at ? byId.get(drag.id) : undefined;
  const title = titleFor(preset, order.length || count, take);

  return (
    <Modal title={title} onClose={onClose} wide column>
      <div
        ref={body}
        tabIndex={-1}
        data-testid="look-at-top"
        data-preset={preset.id}
        className="flex min-h-0 flex-1 flex-col gap-2 outline-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        onMouseDown={keepFocusOnClick}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <label className="flex items-center gap-1">
            Effect
            <select
              aria-label="Effect"
              className="rounded bg-white px-1 ring-1 ring-slate-400"
              value={preset.id}
              onChange={(e) => choosePreset(e.target.value as PresetId)}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {preset.takes && (
            <span
              data-testid="look-take"
              className={classNames(tooMany && 'font-semibold text-red-700')}
            >
              Take up to {take} into your hand ({arrangement.hand.length}/{take}
              )
            </span>
          )}
          {!single && (
            <span className="text-xs text-slate-600">
              ←/→ choose · Shift+←/→ move · keys below send · Enter confirms
            </span>
          )}
        </div>
        {library && order.length === 0 && (
          <p className="text-sm text-slate-600">Your library is empty.</p>
        )}
        {single && (
          <SingleCard
            card={byId.get(order[0]!)!}
            preset={preset}
            roomy={roomy}
            onLane={sendSingle}
            onShuffle={shuffleSingle}
          />
        )}
        {!single && order.length > 0 && (
          <div
            ref={lanesRef}
            role="listbox"
            tabIndex={0}
            aria-label="Looked-at cards"
            aria-activedescendant={focused ? tileId(focused) : undefined}
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto outline-none"
          >
            {shown.map((lane) => (
              <div
                key={lane}
                role="group"
                aria-label={`${laneNames[lane]}, ${laneHints[lane]}`}
                data-lane={lane}
                data-testid={`look-lane-${lane}`}
                className={classNames(
                  'flex shrink-0 items-start gap-2 rounded px-1 py-0.5 ring-1',
                  dropLane === lane
                    ? 'bg-sky-100 ring-sky-500'
                    : 'bg-stone-200/60 ring-transparent'
                )}
              >
                <div className="w-60 shrink-0 truncate py-0.5 text-xs">
                  <kbd className="rounded bg-white px-1 font-mono ring-1 ring-slate-300">
                    {laneKeys[lane].toUpperCase()}
                  </kbd>{' '}
                  <span className="font-semibold">{laneNames[lane]}</span>
                  <span className="text-slate-600">
                    {' · '}
                    {lane === 'bottom' && bottomRandom
                      ? 'random order'
                      : laneHints[lane]}
                  </span>
                </div>
                <div className="flex min-h-6 flex-1 flex-wrap gap-1">
                  {arrangement[lane].map((id) => {
                    const card = byId.get(id);
                    if (!card) return null;
                    return (
                      <LookTile
                        key={id}
                        card={card}
                        lane={lane}
                        focused={id === focused}
                        roomy={roomy}
                        dragging={drag?.id === id && drag.at !== null}
                        onFocus={() => setFocusId(id)}
                        onDragStart={startDrag(id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {preset.lanes.includes('bottom') && !single && (
            <>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={bottomRandom}
                  onChange={(e) => setBottomRandom(e.target.checked)}
                />
                Bottom in random order
              </label>
              <button
                type="button"
                className={button}
                onClick={() => {
                  update(restToBottom(arrangement, new Set(plan.placed)));
                  takeFocus();
                }}
              >
                Rest to bottom (R)
              </button>
            </>
          )}
          {preset.shuffles && !single && (
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={shuffleAfter}
                onChange={(e) => setShuffleAfter(e.target.checked)}
              />
              Shuffle instead (S)
            </label>
          )}
          <span className="flex-1" />
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          {!single && (
            <button
              type="button"
              className={`${button} bg-slate-800 text-white`}
              disabled={!canConfirm}
              onClick={confirm}
            >
              Confirm
            </button>
          )}
        </div>
      </div>
      {dragged &&
        drag?.at &&
        createPortal(
          <div
            data-testid="look-drag-ghost"
            className="pointer-events-none fixed z-50 rounded bg-white px-2 py-0.5 text-sm font-medium opacity-90 shadow-lg ring-1 ring-sky-500"
            style={{ left: drag.at.x + 8, top: drag.at.y + 8 }}
          >
            {dragged.ref?.name ?? 'Card'}
          </div>,
          document.body
        )}
    </Modal>
  );
};

interface SingleProps {
  card: CardView;
  preset: Preset;
  roomy: boolean;
  onLane(lane: Lane): void;
  onShuffle(): void;
}

// With one card there is nothing to order, so each lane is one click.
const SingleCard = ({
  card,
  preset,
  roomy,
  onLane,
  onShuffle,
}: SingleProps) => {
  const home = defaultLane(preset);
  const choices = [home, ...preset.lanes.filter((lane) => lane !== home)];
  return (
    <div className="flex min-h-0 flex-1 items-center gap-4">
      <div
        data-testid="look-card"
        data-instance-id={card.instanceId}
        data-card-name={card.ref?.name}
        data-dest={home}
        className="shrink-0"
      >
        <Card card={card} size={roomy ? 'sm' : 'xs'} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div data-testid="look-single-name" className="min-w-0">
          <div className="truncate font-semibold">
            {card.ref?.name ?? 'Unknown card'}
          </div>
          <div className="truncate text-xs text-slate-600">
            {card.ref?.typeLine}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {choices.map((lane) => (
            <button
              key={lane}
              type="button"
              className={classNames(
                button,
                lane === home && 'bg-slate-800 text-white'
              )}
              onClick={() => onLane(lane)}
            >
              {oneClickLabels[lane]} ({laneKeys[lane].toUpperCase()})
            </button>
          ))}
          {preset.shuffles && (
            <button type="button" className={button} onClick={onShuffle}>
              Shuffle (S)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LookAtTopDialog;
