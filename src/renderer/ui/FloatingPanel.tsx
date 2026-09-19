import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import type { PanelPlacement } from '@shared/settings';
import classNames from 'classnames';
import {
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  clampOffset,
  offsetFor,
  placementFor,
  type Point,
  type Size,
} from './panelGeometry';

const MARGIN = 12;

interface Drag {
  pointerId: number;
  start: Point;
  from: Point;
  at: Point;
}

const sizeOf = (el: HTMLElement | null | undefined): Size => ({
  width: el?.clientWidth ?? 0,
  height: el?.clientHeight ?? 0,
});

const sameSize = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

// A box that floats over its positioned parent. It is dragged by its title
// bar, stays inside the parent as that resizes, and folds down to the title
// bar alone. The owner keeps the placement, so it can persist it.
const FloatingPanel = ({
  title,
  placement,
  onPlacementChange,
  testId,
  className,
  children,
}: {
  title: string;
  placement: PanelPlacement;
  onPlacementChange(next: PanelPlacement): void;
  testId?: string;
  // Applied while expanded, e.g. a width; the folded chip sizes to fit.
  className?: string;
  children: ReactNode;
}) => {
  const panel = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Size>({ width: 0, height: 0 });
  const [own, setOwn] = useState<Size>({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const { collapsed } = placement;

  useLayoutEffect(() => {
    const el = panel.current;
    const parent = el?.parentElement;
    if (!el || !parent) return undefined;
    const measure = () => {
      const nextRoom = sizeOf(parent);
      const nextOwn = { width: el.offsetWidth, height: el.offsetHeight };
      setRoom((prev) => (sameSize(prev, nextRoom) ? prev : nextRoom));
      setOwn((prev) => (sameSize(prev, nextOwn) ? prev : nextOwn));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const offset = drag?.at ?? offsetFor(placement, room, own, MARGIN);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      from: offset,
      at: offset,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const at = clampOffset(
      {
        x: drag.from.x + e.clientX - drag.start.x,
        y: drag.from.y + e.clientY - drag.start.y,
      },
      room,
      own,
      MARGIN
    );
    setDrag({ ...drag, at });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (drag.at.x === drag.from.x && drag.at.y === drag.from.y) return;
    onPlacementChange({
      ...placementFor(drag.at, room, own, MARGIN, placement),
      collapsed,
    });
  };

  const toggle = () =>
    onPlacementChange({ ...placement, collapsed: !collapsed });

  return (
    <div
      ref={panel}
      data-testid={testId}
      data-collapsed={collapsed}
      className={classNames(
        'absolute left-0 top-0 z-10 rounded-lg bg-slate-900/85 text-slate-100 shadow-lg',
        collapsed ? 'w-max' : className
      )}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <div
        data-testid={testId && `${testId}-handle`}
        className={classNames(
          'flex touch-none select-none items-center gap-2 px-2 py-1',
          drag ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h3>
        <button
          type="button"
          className="rounded p-0.5 text-slate-300 hover:bg-slate-700 hover:text-white"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? (
            <ChevronUpIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </button>
      </div>
      {!collapsed && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
};

export default FloatingPanel;
