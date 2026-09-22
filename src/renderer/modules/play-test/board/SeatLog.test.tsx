import type { TableEntry } from '@shared/net/remoteViews';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SeatLog from './SeatLog';

const at = (minute: number) => new Date(2026, 8, 22, 10, minute).getTime();

const log: TableEntry[] = [
  {
    kind: 'action',
    id: 1,
    at: at(1),
    playerId: 'p2',
    playerName: 'Bob',
    text: 'drew 2 cards',
  },
  {
    kind: 'action',
    id: 2,
    at: at(2),
    playerId: 'p3',
    playerName: 'Carol',
    text: 'played Forest',
  },
  {
    kind: 'roll',
    id: 3,
    at: at(3),
    event: {
      id: 1,
      by: 'p2',
      byName: 'Bob',
      roll: { type: 'die', sides: 20, result: 17 },
    },
  },
  {
    kind: 'action',
    id: 4,
    at: at(4),
    playerId: 'p2',
    playerName: 'Bob',
    text: 'played Mountain',
  },
];

const renderLog = (open = true, onToggle = vi.fn()) => {
  render(
    <SeatLog
      log={log}
      playerId="p2"
      name="Bob"
      open={open}
      onToggle={onToggle}
    />
  );
  return { onToggle, user: userEvent.setup() };
};

const lines = () =>
  screen.getAllByTestId('seat-log-entry').map((li) => li.textContent);

describe('SeatLog', () => {
  it('shows only that player, newest first', () => {
    renderLog();
    expect(lines()).toEqual([
      '10:04 AMplayed Mountain',
      '10:03 AMrolled a d20: 17',
      '10:01 AMdrew 2 cards',
    ]);
  });

  it('names the roller nowhere: the seat already says who', () => {
    renderLog();
    expect(screen.queryByText(/Bob rolled/)).toBeNull();
  });

  it('counts the entries even when it is folded away', async () => {
    const t = renderLog(false);
    expect(screen.queryByTestId('seat-log-list')).toBeNull();
    expect(screen.getByTestId('seat-log')).toHaveAttribute('data-entries', '3');

    await t.user.click(screen.getByRole('button', { name: "Show Bob's log" }));
    expect(t.onToggle).toHaveBeenCalled();
  });

  it('says so when that player has done nothing yet', () => {
    render(<SeatLog log={[]} playerId="p2" name="Bob" open />);
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
    expect(screen.queryAllByTestId('seat-log-entry')).toHaveLength(0);
  });
});
