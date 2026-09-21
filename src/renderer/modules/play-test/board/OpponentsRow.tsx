import type { RemotePeer } from '@shared/net/remoteViews';
import {
  MAX_OPPONENT_ROW_HEIGHT,
  MIN_OPPONENT_ROW_HEIGHT,
} from '@shared/settings';
import classNames from 'classnames';
import { type PointerEvent, useRef, useState } from 'react';

import OpponentSide from './OpponentSide';

interface Resize {
  pointerId: number;
  startY: number;
  from: number;
  height: number;
  // What the row is measured against for this drag: the board below it
  // keeps the rest, so a tall hand tray shortens the reach too.
  available: number;
}

// The row never takes more than this share of the board, so the local
// half keeps room whatever height was saved on whatever screen.
const MAX_SHARE = 0.6;

const rowHeight = (height: number, available = window.innerHeight) =>
  Math.round(
    Math.max(
      MIN_OPPONENT_ROW_HEIGHT,
      Math.min(height, MAX_OPPONENT_ROW_HEIGHT, available * MAX_SHARE)
    )
  );

// Every opponent's seat, across the top of the board. It is resized
// from its bottom edge, and each seat takes an equal share of it.
const OpponentsRow = ({
  peers,
  height,
  onHeightChange,
  showTurn,
}: {
  peers: RemotePeer[];
  height: number;
  onHeightChange(next: number): void;
  showTurn: boolean;
}) => {
  const row = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const pod = peers.length > 1;
  const shown = resize?.height ?? rowHeight(height);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Measured, not the saved height: a tall hand tray can squeeze the
    // row, and the drag has to start from what is on screen.
    const from = Math.round(row.current?.getBoundingClientRect().height ?? 0);
    setResize({
      pointerId: e.pointerId,
      startY: e.clientY,
      from,
      height: from,
      available: row.current?.parentElement?.clientHeight || window.innerHeight,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!resize || e.pointerId !== resize.pointerId) return;
    const next = rowHeight(
      resize.from + (e.clientY - resize.startY),
      resize.available
    );
    setResize({ ...resize, height: next });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!resize || e.pointerId !== resize.pointerId) return;
    setResize(null);
    if (resize.height !== resize.from) onHeightChange(resize.height);
  };

  return (
    <div
      ref={row}
      data-testid="opponents"
      className={classNames(
        'relative grid min-h-0 bg-slate-900',
        // Alleys around the seats, so each pod board reads as one.
        pod && 'gap-x-3 px-1'
      )}
      style={{
        height: shown,
        // The board below never loses its share, whatever the saved
        // height and however tall the hand tray is.
        maxHeight: `${MAX_SHARE * 100}%`,
        gridTemplateColumns: `repeat(${peers.length}, minmax(0, 1fr))`,
      }}
    >
      {peers.map((peer) => (
        <OpponentSide
          key={peer.info.playerId}
          peer={peer.info}
          view={peer.view}
          seat={peer.seat}
          compact={pod}
          showTurn={showTurn}
        />
      ))}
      <div
        data-testid="opponents-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize opponents"
        className="absolute inset-x-0 -bottom-1.5 z-20 h-3 cursor-ns-resize touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setResize(null)}
      />
    </div>
  );
};

export default OpponentsRow;
