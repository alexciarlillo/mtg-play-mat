import { idleNetState } from '@shared/net/lobby';
import { defaultSettings } from '@shared/settings';
import type { DeckSummary } from '@shared/types/decks';
import type { PlayTestStatus } from '@shared/types/playTest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PlayOnline from './PlayOnline';

const deck = (id: number, name: string): DeckSummary => ({
  id,
  name,
  format: 'constructed',
  displayPrintingId: null,
  cardCount: 60,
  updatedAt: '2026-09-18',
});

const closed: PlayTestStatus = {
  open: false,
  deck: null,
  sampleDeck: false,
  handInBoard: false,
};

let pushStatus: (status: PlayTestStatus) => void = () => {};

const makeApi = (status: PlayTestStatus, decks: DeckSummary[]) => ({
  getSettings: vi.fn(async () => ({
    ...defaultSettings,
    displayName: 'Alex',
  })),
  onSettingsChanged: vi.fn(() => () => {}),
  getNetState: vi.fn(async () => idleNetState),
  onNetState: vi.fn(() => () => {}),
  getPlayTestStatus: vi.fn(async () => status),
  onPlayTestStatus: vi.fn((listener: (s: PlayTestStatus) => void) => {
    pushStatus = listener;
    return () => {};
  }),
  listDecks: vi.fn(async () => decks),
  startPlayTest: vi.fn(async () => {}),
  startSamplePlayTest: vi.fn(async () => {}),
  restartPlayTest: vi.fn(async () => {}),
  closePlayTest: vi.fn(async () => {}),
  netHost: vi.fn(async () => {}),
});

let api: ReturnType<typeof makeApi>;

const setup = (
  status = closed,
  decks = [deck(1, 'Elves'), deck(2, 'Burn')]
) => {
  api = makeApi(status, decks);
  vi.stubGlobal('api', api);
  return render(
    <MemoryRouter>
      <PlayOnline />
    </MemoryRouter>
  );
};

beforeEach(() => {
  pushStatus = () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PlayOnline game setup', () => {
  it('starts the picked deck, then offers restart and close', async () => {
    const user = userEvent.setup();
    setup();

    const select = await screen.findByRole('combobox', { name: 'Deck' });
    await waitFor(() => expect(select).toHaveValue('1'));
    await user.selectOptions(select, 'Burn (60 cards)');
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(api.startPlayTest).toHaveBeenCalledWith(2);

    act(() =>
      pushStatus({ ...closed, open: true, deck: { id: 2, name: 'Burn' } })
    );
    expect(screen.getByTestId('game-status')).toHaveTextContent(
      'Game open with Burn.'
    );
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Restart game' }));
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(api.restartPlayTest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close game' }));
    const dialog = screen.getByRole('dialog', { name: 'Close game?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Close game' })
    );
    expect(api.closePlayTest).toHaveBeenCalledTimes(1);
  });

  it('switches decks only after confirming', async () => {
    const user = userEvent.setup();
    setup({ ...closed, open: true, deck: { id: 1, name: 'Elves' } });

    const select = await screen.findByRole('combobox', { name: 'Deck' });
    await waitFor(() => expect(select).toHaveValue('1'));
    expect(screen.queryByRole('button', { name: 'Switch deck' })).toBeNull();

    await user.selectOptions(select, 'Burn (60 cards)');
    await user.click(screen.getByRole('button', { name: 'Switch deck' }));
    expect(api.startPlayTest).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Switch decks?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Switch deck' })
    );
    expect(api.startPlayTest).toHaveBeenCalledWith(2);
  });

  it('offers the sample deck when main allows it', async () => {
    const user = userEvent.setup();
    setup({ ...closed, sampleDeck: true }, []);

    const select = await screen.findByRole('combobox', { name: 'Deck' });
    expect(select).toHaveValue('sample');
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(api.startSamplePlayTest).toHaveBeenCalledTimes(1);
  });

  it('points to the deck builder when there are no decks', async () => {
    setup(closed, []);
    expect(
      await screen.findByRole('link', { name: /Import one/ })
    ).toHaveAttribute('href', '/decks');
    expect(screen.queryByRole('combobox', { name: 'Deck' })).toBeNull();
  });

  it('nudges toward a deck when hosting with no game open', async () => {
    const user = userEvent.setup();
    setup();

    const select = await screen.findByRole('combobox', { name: 'Deck' });
    expect(screen.queryByTestId('no-game-notice')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Join a game' }));
    expect(screen.getByTestId('no-game-notice')).toBeInTheDocument();
    expect(select).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(api.netHost).toHaveBeenCalledTimes(1);

    act(() =>
      pushStatus({ ...closed, open: true, deck: { id: 1, name: 'Elves' } })
    );
    await user.click(screen.getByRole('button', { name: 'Join a game' }));
    expect(screen.queryByTestId('no-game-notice')).toBeNull();
  });
});
