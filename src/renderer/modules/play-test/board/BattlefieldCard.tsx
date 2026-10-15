import type { CardView, Position, ZoneId } from '@shared/game';
import classNames from 'classnames';
import { useRef, useState } from 'react';
import Draggable, {
  type DraggableEvent,
  type DraggableEventHandler,
} from 'react-draggable';

import Card from '../../../ui/Card';
import CardArt from '../../../ui/CardArt';
import { useHoverKeys } from '../../../ui/CardPreview';
import { cardWidths } from '../../../ui/cardSizes';
import { moveTo } from '../common/cardMenus';
import {
  battlefieldHoverAction,
  selectionHoverAction,
} from '../common/hoverActions';
import { dispatch } from '../viewStore';
import {
  battlefieldMenu,
  type BattlefieldMenuOptions,
  selectionMenu,
} from './battlefieldMenu';
import CounterControls from './CounterControls';
import { dropZoneAt } from './dropZones';
import {
  type Offset,
  useGroupOffset,
  useSelectedIds,
  useSelection,
} from './selection';

const ORIGIN: Position = { x: 0, y: 0 };

// Movement under this many pixels is a click (tap), not a drag.
const CLICK_SLOP = 2;

const pointOf = (e: DraggableEvent) => {
  const point = 'changedTouches' in e ? e.changedTouches[0] : e;
  return { x: point.clientX, y: point.clientY };
};

const clamp = (value: number, max: number) =>
  Math.max(0, Math.min(value, Math.max(0, max)));

const shifted = (at: Position, { dx, dy }: Offset): Position => ({
  x: at.x + dx,
  y: at.y + dy,
});

// Limits a group's shift so every card stays inside the field, keeping
// their layout. A card already outside may stay, but goes no further.
const clampGroup = (
  cards: CardView[],
  offset: Offset,
  max: { x: number; y: number }
): Offset => {
  const axis = (delta: number, pick: (at: Position) => number, top: number) => {
    const starts = cards.map((card) => pick(card.position ?? ORIGIN));
    const lo = Math.max(...starts.map((start) => Math.min(-start, 0)));
    const hi = Math.min(...starts.map((start) => Math.max(top - start, 0)));
    return Math.max(lo, Math.min(delta, hi));
  };
  return {
    dx: axis(offset.dx, (at) => at.x, max.x),
    dy: axis(offset.dy, (at) => at.y, max.y),
  };
};

const shiftKeyOf = (e: DraggableEvent) => 'shiftKey' in e && e.shiftKey;

interface Props extends BattlefieldMenuOptions {
  card: CardView;
  // The field's CSS scale, so drags track the pointer when it is shrunk.
  scale?: number;
  // How far the field's contents are shifted right of its left edge, so
  // a card dropped at the right edge stays inside it.
  offsetX?: number;
  // The owner's badge, for a borrowed permanent.
  owner?: string | null;
}

const BattlefieldCard = ({
  card,
  scale = 1,
  offsetX = 0,
  onAddCounter,
  onAttach,
  onPutInLibrary,
  giveTo,
  ownerName,
  revealTargets,
  owner = null,
}: Props) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const selection = useSelection();
  const selected = useSelectedIds().has(card.instanceId);
  // Set while another selected card drags this one along.
  const follow = useGroupOffset(card);
  const [dragging, setDragging] = useState(false);
  // Holds the drop point until main's next view of this card arrives, so
  // the card doesn't snap back for a frame while the action round-trips.
  const [drop, setDrop] = useState<{ from: CardView; at: Position } | null>(
    null
  );

  const home = card.position ?? ORIGIN;
  const held = drop?.from === card ? drop.at : home;
  const position = follow ? shifted(home, follow) : held;
  // Read when the drag starts, so it holds for the whole drag.
  const group = useRef<CardView[] | null>(null);
  const groupOffset = useRef<Offset>({ dx: 0, dy: 0 });

  const handleDrag: DraggableEventHandler = (_event, data) => {
    if (!dragging) {
      setDragging(true);
      group.current = selection?.groupOf(card) ?? null;
      if (group.current) selection?.startDrag(card.instanceId);
    }
    if (group.current) {
      groupOffset.current = {
        dx: Math.round(data.x - position.x),
        dy: Math.round(data.y - position.y),
      };
      selection?.moveDrag(groupOffset.current);
    }
  };

  const dropGroup = (cards: CardView[], at: Position, zone: ZoneId | null) => {
    const ids = cards.map((each) => each.instanceId);
    const playerId = card.controller;
    if (zone) {
      setDrop({ from: card, at });
      selection?.dropDrag(groupOffset.current);
      dispatch({
        type: 'moveCards',
        playerId,
        instanceIds: ids,
        to: zone,
        ...(zone === 'library' && { index: 0 }),
      });
      return;
    }
    const node = nodeRef.current;
    const field = node?.parentElement;
    const wanted = { dx: at.x - position.x, dy: at.y - position.y };
    const offset =
      node && field
        ? clampGroup(cards, wanted, {
            x: field.clientWidth - offsetX - node.offsetWidth,
            y: field.clientHeight - node.offsetHeight,
          })
        : wanted;
    setDrop({ from: card, at: shifted(position, offset) });
    selection?.dropDrag(offset);
    dispatch({
      type: 'setPositions',
      playerId,
      positions: cards.map((each) => ({
        instanceId: each.instanceId,
        position: shifted(each.position ?? ORIGIN, offset),
      })),
    });
  };

  const handleStop: DraggableEventHandler = (event, data) => {
    setDragging(false);
    const cards = group.current;
    group.current = null;
    const at = { x: Math.round(data.x), y: Math.round(data.y) };

    if (
      Math.abs(at.x - position.x) <= CLICK_SLOP &&
      Math.abs(at.y - position.y) <= CLICK_SLOP
    ) {
      if (cards) selection?.endDrag();
      if (shiftKeyOf(event)) {
        selection?.toggle(card.instanceId);
        return;
      }
      // Only this card; keys, the menu and drags act on the group.
      dispatch({ type: 'toggleTap', instanceId: card.instanceId });
      return;
    }

    const pointer = pointOf(event);
    const target = dropZoneAt(pointer.x, pointer.y);
    // Only commanders belong in the command zone.
    const commanders = (cards ?? [card]).every((each) => each.isCommander);
    const zone = target === 'command' && !commanders ? null : target;

    if (cards) {
      dropGroup(cards, at, zone);
      return;
    }

    if (zone) {
      setDrop({ from: card, at });
      moveTo(card, zone, zone === 'library' ? 0 : undefined);
      return;
    }

    // Drags are unbounded so cards can reach the zone piles; a drop
    // anywhere else lands back inside the battlefield.
    const node = nodeRef.current;
    const field = node?.parentElement;
    const inside =
      node && field
        ? {
            x: clamp(at.x, field.clientWidth - offsetX - node.offsetWidth),
            y: clamp(at.y, field.clientHeight - node.offsetHeight),
          }
        : at;

    setDrop({ from: card, at: inside });
    dispatch({
      type: 'setPosition',
      instanceId: card.instanceId,
      position: inside,
    });
  };

  // On the wrapper, so pointing at the counter badges still counts.
  const hoverKeys = useHoverKeys((key) => {
    // R restarts over a permanent; only hand cards take it.
    if (key === 'r') return false;
    const together = selection?.groupOf(card);
    const action = together
      ? selectionHoverAction(together, card, key)
      : battlefieldHoverAction(card, key);
    if (action) dispatch(action);
    return undefined;
  });

  const together = selected ? selection?.groupOf(card) : null;
  const single = battlefieldMenu(card, {
    onAddCounter,
    onAttach,
    onPutInLibrary,
    giveTo,
    ownerName,
    revealTargets,
  });
  const menu =
    together && selection
      ? [
          ...selectionMenu(together, () => selection.clear()),
          { title: 'This card', action: null, heading: true },
          ...single,
        ]
      : single;

  return (
    <>
      {dragging && (
        <div
          className={classNames(
            'absolute left-0 top-0 aspect-card opacity-50 pointer-events-none',
            cardWidths.md
          )}
          style={{ transform: `translate(${home.x}px, ${home.y}px)` }}
        >
          <div className={classNames('h-full', { 'rotate-90': card.tapped })}>
            <CardArt
              owner={card.owner}
              cardRef={card.ref}
              faceIndex={card.faceIndex}
              faceDown={card.faceDown}
            />
          </div>
        </div>
      )}
      <Draggable
        nodeRef={nodeRef}
        position={position}
        scale={scale}
        handle=".handle"
        cancel=".no-drag"
        onDrag={handleDrag}
        onStop={handleStop}
        enableUserSelectHack={false}
      >
        <div
          ref={nodeRef}
          data-testid="battlefield-card"
          data-attached-to={card.attachedTo ?? undefined}
          data-selected={selected || undefined}
          {...hoverKeys}
          className={classNames('group absolute left-0 top-0', {
            'z-20': dragging || follow,
          })}
        >
          <Card
            card={card}
            menu={menu}
            size="md"
            owner={owner}
            className={classNames({ 'ring-4 ring-sky-400!': selected })}
          />
          {!dragging && !follow && <CounterControls card={card} />}
        </div>
      </Draggable>
    </>
  );
};

export default BattlefieldCard;
