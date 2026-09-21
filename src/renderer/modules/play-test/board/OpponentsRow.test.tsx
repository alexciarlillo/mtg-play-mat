import type { PublicView } from '@shared/game';
import type { RemotePeer } from '@shared/net/remoteViews';
import { DEFAULT_OPPONENT_ROW_HEIGHT } from '@shared/settings';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import { POD_PANEL_WIDTH, SIDE_PANEL_WIDTH } from './layout';
import OpponentsRow from './OpponentsRow';

const view: PublicView = {
  seq: 1,
  playerId: 'p2',
  name: 'Bob',
  life: 40,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: { battlefield: [], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
};

const podOf = (names: string[]): RemotePeer[] =>
  names.map((name, seat) => ({
    info: { playerId: `p${seat + 2}`, name, appVersion: '0.0.0' },
    seat: seat + 1,
    view: { ...view, playerId: `p${seat + 2}`, name },
  }));

const renderRow = (names: string[], onHeightChange = vi.fn()) => {
  Object.assign(window, { api: { dispatch: vi.fn(() => Promise.resolve()) } });
  const row = (peers: RemotePeer[]) => (
    <ContextMenuProvider>
      <OpponentsRow
        peers={peers}
        height={DEFAULT_OPPONENT_ROW_HEIGHT}
        onHeightChange={onHeightChange}
        showTurn={false}
      />
    </ContextMenuProvider>
  );
  const { rerender } = render(row(podOf(names)));
  return { rerender: (next: string[]) => rerender(row(podOf(next))) };
};

const seat = (name: string) =>
  screen
    .getAllByTestId('opponent-side')
    .find((el) => el.dataset.playerName === name) as HTMLElement;

const toggle = async (name: string) => {
  await userEvent.click(within(seat(name)).getByTestId('opponent-hide'));
};

const boxOf = (name: string) => seat(name).parentElement as HTMLElement;

const sizes = (name: string) => {
  const { flexGrow, flexBasis } = boxOf(name).style;
  return `${flexGrow}/${flexBasis}`;
};

const board = `1/0px`;
const folded = `0/${POD_PANEL_WIDTH}px`;

describe('OpponentsRow hidden boards', () => {
  it('folds one seat to its panel and hands its width to the others', async () => {
    renderRow(['Bob', 'Carol', 'Dave']);
    expect(sizes('Bob')).toBe(board);

    await toggle('Carol');
    expect(sizes('Carol')).toBe(folded);
    expect(sizes('Bob')).toBe(board);
    expect(sizes('Dave')).toBe(board);
    expect(screen.getAllByTestId('opponent-battlefield')).toHaveLength(2);
  });

  it('hides any number of seats independently', async () => {
    renderRow(['Bob', 'Carol', 'Dave']);
    await toggle('Bob');
    await toggle('Dave');
    expect(sizes('Bob')).toBe(folded);
    expect(sizes('Dave')).toBe(folded);
    // Hiding the others is how a single board is read in full.
    expect(sizes('Carol')).toBe(board);
    expect(screen.getAllByTestId('opponent-battlefield')).toHaveLength(1);

    await toggle('Bob');
    expect(sizes('Bob')).toBe(board);
    expect(sizes('Dave')).toBe(folded);
  });

  it('keeps a folded seat readable: name, life, zones and commanders', async () => {
    renderRow(['Bob', 'Carol']);
    await toggle('Bob');
    const panel = within(seat('Bob'));
    expect(panel.getByTestId('opponent-name')).toHaveTextContent('Bob');
    expect(panel.getByTestId('opponent-life')).toHaveTextContent('40');
    expect(panel.getByTestId('opponent-library')).toHaveAttribute(
      'data-count',
      '53'
    );
    expect(panel.getByTestId('opponent-graveyard')).toBeInTheDocument();
    expect(panel.queryByTestId('opponent-battlefield')).toBeNull();
  });

  it('names the control for both directions and shows the board again', async () => {
    renderRow(['Bob', 'Carol']);
    const button = within(seat('Bob')).getByTestId('opponent-hide');
    expect(button).toHaveAccessibleName("Hide Bob's board");
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await toggle('Bob');
    const pressed = within(seat('Bob')).getByTestId('opponent-hide');
    expect(pressed).toHaveAccessibleName("Show Bob's board");
    expect(pressed).toHaveAttribute('aria-pressed', 'true');

    await toggle('Bob');
    expect(sizes('Bob')).toBe(board);
  });

  it('leaves every hidden seat a way back when all are hidden', async () => {
    renderRow(['Bob', 'Carol', 'Dave']);
    for (const name of ['Bob', 'Carol', 'Dave']) await toggle(name);
    expect(screen.queryByTestId('opponent-battlefield')).toBeNull();
    expect(screen.getByTestId('opponents')).toHaveAttribute(
      'data-hidden-boards',
      '3'
    );
    ['Bob', 'Carol', 'Dave'].forEach((name) => {
      expect(within(seat(name)).getByTestId('opponent-hide')).toBeEnabled();
      expect(sizes(name)).toBe(folded);
    });

    await toggle('Carol');
    expect(screen.getAllByTestId('opponent-battlefield')).toHaveLength(1);
  });

  it('hides a duel opponent too, folding to the wider panel', async () => {
    renderRow(['Bob']);
    await toggle('Bob');
    expect(sizes('Bob')).toBe(`0/${SIDE_PANEL_WIDTH}px`);
    expect(screen.queryByTestId('opponent-battlefield')).toBeNull();
    expect(within(seat('Bob')).getByTestId('opponent-life')).toHaveTextContent(
      '40'
    );
  });

  it('forgets a seat that has left, and never folds the wrong one', async () => {
    const { rerender } = renderRow(['Bob', 'Carol', 'Dave']);
    await toggle('Dave');
    expect(screen.getByTestId('opponents')).toHaveAttribute(
      'data-hidden-boards',
      '1'
    );

    rerender(['Bob', 'Carol']);
    expect(screen.getByTestId('opponents')).not.toHaveAttribute(
      'data-hidden-boards'
    );
    expect(sizes('Bob')).toBe(board);
    expect(sizes('Carol')).toBe(board);
    expect(screen.getAllByTestId('opponent-battlefield')).toHaveLength(2);
  });

  it('leaves the row height alone, hidden or not', async () => {
    const onHeightChange = vi.fn();
    renderRow(['Bob', 'Carol'], onHeightChange);
    const row = screen.getByTestId('opponents');
    expect(row.style.height).toBe(`${DEFAULT_OPPONENT_ROW_HEIGHT}px`);

    await toggle('Bob');
    expect(row.style.height).toBe(`${DEFAULT_OPPONENT_ROW_HEIGHT}px`);
    expect(onHeightChange).not.toHaveBeenCalled();

    // jsdom lays nothing out, so the drag starts from a measured zero.
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      height: 320,
    } as DOMRect);
    const handle = screen.getByTestId('opponents-resize');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 440 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 440 });
    expect(onHeightChange).toHaveBeenCalledWith(360);
    expect(sizes('Bob')).toBe(folded);
  });
});
