import type { InstanceId } from '@shared/game';
import { type PointerEvent, useRef, useState } from 'react';

import type { SelectionStore } from './selection';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The box being dragged, kept out of React state so only the overlay
// redraws as the pointer moves, not the whole board.
export class BoxStore {
  box: Box | null = null;

  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(box: Box | null) {
    if (box === this.box) return;
    this.box = box;
    this.listeners.forEach((listener) => listener());
  }
}

// Movement under this many pixels is a click, which clears the selection.
const SLOP = 4;

// Presses on these keep their own meaning: cards drag, panels move, and
// controls click.
const notEmpty = [
  '[data-testid="battlefield-card"]',
  '[data-testid="table-panel"]',
  '[data-testid="reveal-panel"]',
  '[role="dialog"]',
  '[role="menu"]',
  'button',
  'input',
  'select',
  'textarea',
  'a',
].join(', ');

interface Drag {
  pointerId: number;
  start: { x: number; y: number };
  // Shift adds to what was selected before; otherwise the box replaces it.
  base: ReadonlySet<InstanceId>;
  additive: boolean;
  moved: boolean;
}

const boxOf = (a: Drag['start'], x: number, y: number): Box => ({
  left: Math.min(a.x, x),
  top: Math.min(a.y, y),
  width: Math.abs(x - a.x),
  height: Math.abs(y - a.y),
});

const touches = (box: Box, r: DOMRect) =>
  r.left <= box.left + box.width &&
  r.right >= box.left &&
  r.top <= box.top + box.height &&
  r.bottom >= box.top;

// The own permanents inside the area whose cards the box touches.
const cardsIn = (area: Element, box: Box): InstanceId[] =>
  [
    ...area.querySelectorAll<HTMLElement>(
      '[data-testid="battlefield-card"] [data-testid="card"]'
    ),
  ]
    .filter((el) => touches(box, el.getBoundingClientRect()))
    .flatMap((el) => (el.dataset.instanceId ? [el.dataset.instanceId] : []));

// A box dragged out from empty battlefield selects every card it touches;
// a plain click there clears the selection. Only the left button starts
// one, so the battlefield's right-click menu is left alone.
export const useMarquee = (selection: SelectionStore) => {
  const drag = useRef<Drag | null>(null);
  const [box] = useState(() => new BoxStore());

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    // A click that dismisses an open menu shouldn't also drop the group.
    if (document.querySelector('[role="menu"]')) return;
    if ((e.target as Element).closest(notEmpty)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      base: e.shiftKey ? selection.ids : new Set(),
      additive: e.shiftKey,
      moved: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || e.pointerId !== current.pointerId) return;
    const next = boxOf(current.start, e.clientX, e.clientY);
    if (!current.moved && Math.max(next.width, next.height) < SLOP) return;
    current.moved = true;
    window.getSelection()?.removeAllRanges();
    box.set(next);
    selection.set([...current.base, ...cardsIn(e.currentTarget, next)]);
  };

  const finish = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || e.pointerId !== current.pointerId) return;
    drag.current = null;
    box.set(null);
    if (!current.moved && !current.additive && !cancelled) selection.clear();
  };

  return {
    box,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLElement>) => finish(e, false),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => finish(e, true),
      // Capture can be lost without a pointerup, e.g. when the window
      // loses focus mid-drag.
      onLostPointerCapture: (e: PointerEvent<HTMLElement>) => finish(e, true),
    },
  };
};
