import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import type { PrivateView } from '@shared/game';
import {
  MAX_TRAY_HEIGHT,
  MIN_TRAY_HEIGHT,
  type TrayPlacement,
} from '@shared/settings';
import { type PointerEvent, useState } from 'react';

import Hand from '../hand/Hand';
import type { ViewStore } from '../viewStore';
import HandCardDrag from './HandCardDrag';

interface Resize {
  pointerId: number;
  startY: number;
  from: number;
  height: number;
}

// The tray never takes more than this share of the window, so the
// battlefield keeps room whatever height was saved.
const MAX_SHARE = 0.7;

const trayHeight = (height: number) =>
  Math.max(
    MIN_TRAY_HEIGHT,
    Math.min(height, MAX_TRAY_HEIGHT, window.innerHeight * MAX_SHARE)
  );

// The private hand docked along the bottom of the board window. It is
// resized from its top edge and folds down to its title bar.
const HandTray = ({
  store,
  placement,
  onPlacementChange,
  onBusyChange,
}: {
  store: ViewStore<PrivateView>;
  placement: TrayPlacement;
  onPlacementChange(next: TrayPlacement): void;
  onBusyChange(busy: boolean): void;
}) => {
  const [resize, setResize] = useState<Resize | null>(null);
  const { collapsed } = placement;
  const height = resize?.height ?? trayHeight(placement.height);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setResize({
      pointerId: e.pointerId,
      startY: e.clientY,
      from: height,
      height,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!resize || e.pointerId !== resize.pointerId) return;
    const next = trayHeight(resize.from - (e.clientY - resize.startY));
    setResize({ ...resize, height: Math.round(next) });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!resize || e.pointerId !== resize.pointerId) return;
    setResize(null);
    if (resize.height !== resize.from) {
      onPlacementChange({ height: resize.height, collapsed });
    }
  };

  const toggle = () =>
    onPlacementChange({ ...placement, collapsed: !collapsed });

  return (
    <div
      data-testid="hand-tray"
      data-drop-zone="hand"
      data-collapsed={collapsed}
      className="relative shrink-0 border-t-2 border-slate-900"
      style={collapsed ? undefined : { height }}
    >
      {!collapsed && (
        <div
          data-testid="hand-tray-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize hand"
          className="absolute inset-x-0 -top-1.5 z-20 h-3 cursor-ns-resize touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setResize(null)}
        />
      )}
      <Hand
        store={store}
        dock={{
          collapsed,
          onBusyChange,
          wrapCard: (card, node) => (
            <HandCardDrag card={card}>{node}</HandCardDrag>
          ),
          controls: (
            <button
              type="button"
              className="rounded px-1 hover:bg-slate-300"
              aria-label={collapsed ? 'Expand hand' : 'Collapse hand'}
              aria-expanded={!collapsed}
              onClick={toggle}
            >
              {collapsed ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </button>
          ),
        }}
      />
    </div>
  );
};

export default HandTray;
