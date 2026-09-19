import type { TableEntry } from '@shared/net/remoteViews';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TableLog from './TableLog';

const action = (id: number, playerName: string, text: string): TableEntry => ({
  kind: 'action',
  id,
  at: 0,
  playerId: playerName.toLowerCase(),
  playerName,
  text,
});

const roll = (id: number, byName: string, result: number): TableEntry => ({
  kind: 'roll',
  id,
  at: 0,
  event: {
    id,
    by: byName.toLowerCase(),
    byName,
    roll: { type: 'die', sides: 20, result },
  },
});

const history = (count: number) =>
  Array.from({ length: count }, (_, i) => action(i + 1, 'Alice', `step ${i}`));

// jsdom lays nothing out: the list gets a fixed viewport over a content
// height that grows with its entries.
const ROW = 20;
const VIEWPORT = 100;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
    function height(this: HTMLElement) {
      return this.children.length * ROW;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => VIEWPORT
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const list = () => screen.getByTestId('table-log-list');

const renderLog = (log: TableEntry[]) => {
  const view = render(<TableLog log={log} onCustomDie={() => {}} />);
  return {
    update: (next: TableEntry[]) =>
      view.rerender(<TableLog log={next} onCustomDie={() => {}} />),
  };
};

describe('TableLog', () => {
  it('shows actions and rolls in one timeline, oldest first', () => {
    renderLog([
      action(1, 'Alice', 'drew a card'),
      roll(2, 'Bob', 17),
      action(3, 'Bob', 'played Forest'),
    ]);
    const items = within(list()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Alice drew a card$/),
      expect.stringMatching(/Bob rolled a d20: 17$/),
      expect.stringMatching(/Bob played Forest$/),
    ]);
  });

  it('filters to rolls on the Dice tab', async () => {
    const user = userEvent.setup();
    renderLog([action(1, 'Alice', 'drew a card'), roll(2, 'Bob', 5)]);
    await user.click(screen.getByRole('tab', { name: 'Dice' }));
    expect(screen.getByRole('tab', { name: 'Dice' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryAllByTestId('log-entry')).toHaveLength(0);
    expect(screen.getAllByTestId('table-event')).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: 'Log' }));
    expect(screen.getAllByTestId('log-entry')).toHaveLength(1);
  });

  it('follows new entries unless the reader scrolled up', async () => {
    const user = userEvent.setup();
    const log = renderLog(history(10));
    expect(list().scrollTop).toBe(10 * ROW);

    log.update(history(12));
    expect(list().scrollTop).toBe(12 * ROW);

    // Scrolled back to read: new entries don't yank the view.
    list().scrollTop = 40;
    fireEvent.scroll(list());
    log.update(history(15));
    expect(list().scrollTop).toBe(40);

    await user.click(screen.getByRole('button', { name: 'Latest ↓' }));
    expect(list().scrollTop).toBe(15 * ROW);
    expect(screen.queryByRole('button', { name: 'Latest ↓' })).toBeNull();

    // Scrolling back to the end resumes following.
    list().scrollTop = 40;
    fireEvent.scroll(list());
    list().scrollTop = 15 * ROW - VIEWPORT;
    fireEvent.scroll(list());
    log.update(history(16));
    expect(list().scrollTop).toBe(16 * ROW);
  });

  it('says so when there is nothing yet', () => {
    renderLog([]);
    expect(list()).toHaveTextContent('Nothing has happened yet.');
  });
});
