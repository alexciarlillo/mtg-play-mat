import { emptyDebugSnapshot } from '@shared/debug';
import type { NetState } from '@shared/net/lobby';
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
let pushNet: (state: NetState) => void = () => {};
let netState: NetState = idleNetState;

const makeApi = (status: PlayTestStatus, decks: DeckSummary[]) => ({
  getSettings: vi.fn(async () => ({
    ...defaultSettings,
    displayName: 'Alex',
  })),
  onSettingsChanged: vi.fn(() => () => {}),
  getNetState: vi.fn(async () => netState),
  onNetState: vi.fn((listener: (s: NetState) => void) => {
    pushNet = listener;
    return () => {};
  }),
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
  netHostLobby: vi.fn(async () => {}),
  netJoinLobby: vi.fn(async () => {}),
  netCloseSeat: vi.fn(async () => {}),
  netResend: vi.fn(async () => {}),
  netLeave: vi.fn(async () => {}),
  getDebugLog: vi.fn(async () => emptyDebugSnapshot),
  onDebugLog: vi.fn(() => () => {}),
  clearDebugLog: vi.fn(async () => emptyDebugSnapshot),
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
  pushNet = () => {};
  netState = idleNetState;
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
    await user.click(screen.getByRole('tab', { name: 'Invite codes' }));
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

const hosting = (over: Partial<NetState> = {}): NetState => ({
  ...idleNetState,
  role: 'host',
  mode: 'relay',
  phase: 'awaitingReply',
  relayReady: true,
  lobbyCode: 'ABC123',
  seats: [
    { seat: 2, phase: 'empty', invite: null, player: null, error: null },
    { seat: 3, phase: 'empty', invite: null, player: null, error: null },
    { seat: 4, phase: 'empty', invite: null, player: null, error: null },
  ],
  ...over,
});

describe('PlayOnline connection tabs', () => {
  it('opens on the lobby code tab', async () => {
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    expect(screen.getByRole('tab', { name: 'Lobby code' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('panel-relay')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-p2p')).toBeNull();
  });

  it('switches to invite codes and back', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });

    await user.click(screen.getByRole('tab', { name: 'Invite codes' }));
    expect(screen.getByTestId('panel-p2p')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-code')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Lobby code' }));
    expect(screen.getByTestId('panel-relay')).toBeInTheDocument();
  });

  it('pins the tab to a live session and disables the other', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    await user.click(screen.getByRole('tab', { name: 'Invite codes' }));

    act(() => pushNet(hosting()));
    expect(screen.getByTestId('panel-relay')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invite codes' })).toBeDisabled();

    // Leaving hands the choice back.
    act(() => pushNet({ ...idleNetState, relayReady: true }));
    expect(
      screen.getByRole('tab', { name: 'Invite codes' })
    ).not.toBeDisabled();
  });
});

describe('PlayOnline lobby codes', () => {
  it('points at Settings and refuses to start without a relay', async () => {
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    expect(screen.getByTestId('no-relay-notice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Host a game' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join a game' })).toBeDisabled();
  });

  it('hosts once a relay is configured', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    act(() => pushNet({ ...idleNetState, relayReady: true }));
    expect(screen.queryByTestId('no-relay-notice')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Host a game' }));
    expect(api.netHostLobby).toHaveBeenCalledTimes(1);
  });

  it('shows the code grouped, with both ways to share it', async () => {
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    act(() => pushNet(hosting()));

    expect(screen.getByTestId('lobby-code')).toHaveTextContent('ABC-123');
    expect(screen.getByTestId('seats-free')).toHaveTextContent(
      '3 seats still free.'
    );
    expect(
      screen.getByRole('button', { name: 'Copy code' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument();
  });

  it('lists who has joined and can remove them', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    act(() =>
      pushNet(
        hosting({
          phase: 'connected',
          seats: [
            {
              seat: 2,
              phase: 'connected',
              invite: null,
              error: null,
              player: { playerId: 'bob', name: 'Bob', appVersion: '1' },
            },
            {
              seat: 3,
              phase: 'empty',
              invite: null,
              player: null,
              error: null,
            },
            {
              seat: 4,
              phase: 'empty',
              invite: null,
              player: null,
              error: null,
            },
          ],
        })
      )
    );

    expect(screen.getByTestId('seat-2')).toHaveTextContent('Seat 2: Bob');
    expect(screen.getByTestId('seats-free')).toHaveTextContent(
      '2 seats still free.'
    );
    await user.click(screen.getByRole('button', { name: 'Remove seat 2' }));
    expect(api.netCloseSeat).toHaveBeenCalledWith(2);
  });

  it('joins by code, however it was typed', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    act(() => pushNet({ ...idleNetState, relayReady: true }));

    await user.click(screen.getByRole('button', { name: 'Join a game' }));
    const input = screen.getByRole('textbox', { name: 'Lobby code' });
    const join = screen.getByRole('button', { name: 'Join' });
    expect(join).toBeDisabled();

    await user.type(input, 'abc12');
    expect(join).toBeDisabled();
    await user.type(input, '3');
    expect(join).not.toBeDisabled();
    await user.click(join);
    expect(api.netJoinLobby).toHaveBeenCalledWith('abc123');
  });

  it('fills the code in from a deep link', async () => {
    setup();
    await screen.findByRole('combobox', { name: 'Deck' });
    act(() =>
      pushNet({
        ...idleNetState,
        relayReady: true,
        pendingLobbyCode: 'XYZ789',
      })
    );
    expect(screen.getByRole('textbox', { name: 'Lobby code' })).toHaveValue(
      'XYZ-789'
    );
  });
});
