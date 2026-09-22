import type { RemotePeer, TableEntry } from '@shared/net/remoteViews';
import {
  MAX_OPPONENT_ROW_HEIGHT,
  MIN_OPPONENT_ROW_HEIGHT,
} from '@shared/settings';
import classNames from 'classnames';
import { type PointerEvent, useLayoutEffect, useRef, useState } from 'react';

import {
  FULL_PANEL_WIDTH,
  POD_PANEL_WIDTH,
  TIGHT_PANEL_HEIGHT,
} from './layout';
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
// from its bottom edge, and the seats still showing a board share it:
// hiding one hands its width to the others.
const OpponentsRow = ({
  peers,
  height,
  onHeightChange,
  showTurn,
  log,
  logOpen,
  onLogOpenChange,
}: {
  peers: RemotePeer[];
  height: number;
  onHeightChange(next: number): void;
  showTurn: boolean;
  log: TableEntry[];
  // One preference for every seat: folding one away folds them all, so
  // nobody has to do it three times in a pod.
  logOpen: boolean;
  onLogOpenChange(next: boolean): void;
}) => {
  const row = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  // Mats folded away here, by player. Player ids last one session, so
  // this does too.
  const [matsOff, setMatsOff] = useState<string[]>([]);
  const pod = peers.length > 1;
  const panelWidth = pod ? POD_PANEL_WIDTH : FULL_PANEL_WIDTH;
  const isHidden = (playerId: string) => hiddenIds.includes(playerId);
  const shown = resize?.height ?? rowHeight(height);
  // What the row ends up with, which is not what it asked for: a tall
  // hand tray takes the rest of the board and caps it.
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setMeasured(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const tight = !pod && (measured ?? shown) < TIGHT_PANEL_HEIGHT;

  // Only the seats here are ever asked about, and a toggle drops the
  // ids of anyone who has left, so a board can never be folded away by
  // a player who is no longer at the table.
  const toggleHidden = (playerId: string) => {
    setHiddenIds((ids) =>
      ids.includes(playerId)
        ? ids.filter((id) => id !== playerId)
        : [
            ...ids.filter((id) => peers.some((p) => p.info.playerId === id)),
            playerId,
          ]
    );
  };

  const toggleMat = (playerId: string) => {
    setMatsOff((ids) =>
      ids.includes(playerId)
        ? ids.filter((id) => id !== playerId)
        : [
            ...ids.filter((id) => peers.some((p) => p.info.playerId === id)),
            playerId,
          ]
    );
  };

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

  // A hidden seat is exactly its panel; the rest share what is left.
  // Growing and shrinking these is what animates the fold, so they are
  // interpolable numbers rather than grid tracks of fr and px.
  const seatSize = (playerId: string) =>
    isHidden(playerId)
      ? { flexGrow: 0, flexBasis: panelWidth }
      : { flexGrow: 1, flexBasis: 0 };

  return (
    <div
      ref={row}
      data-testid="opponents"
      data-hidden-boards={
        peers.filter((peer) => isHidden(peer.info.playerId)).length || undefined
      }
      className={classNames(
        'relative flex min-h-0 bg-slate-900',
        // Alleys around the seats, so each pod board reads as one.
        pod && 'gap-x-3 px-1'
      )}
      style={{ height: shown, maxHeight: `${MAX_SHARE * 100}%` }}
    >
      {peers.map((peer) => (
        <div
          key={peer.info.playerId}
          className={classNames(
            'flex min-w-0',
            !resize && 'transition-[flex-basis,flex-grow] duration-200 ease-out'
          )}
          style={seatSize(peer.info.playerId)}
        >
          <OpponentSide
            peer={peer.info}
            view={peer.view}
            seat={peer.seat}
            compact={pod}
            tight={tight}
            showTurn={showTurn}
            hidden={isHidden(peer.info.playerId)}
            log={log}
            logOpen={logOpen}
            matId={peer.matId}
            matHidden={matsOff.includes(peer.info.playerId)}
            onToggleHidden={() => toggleHidden(peer.info.playerId)}
            onToggleLog={() => onLogOpenChange(!logOpen)}
            onToggleMat={() => toggleMat(peer.info.playerId)}
          />
        </div>
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
