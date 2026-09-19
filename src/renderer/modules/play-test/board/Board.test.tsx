import type { PublicView } from '@shared/game';
import type { OpponentState } from '@shared/net/remoteViews';
import { defaultSettings, type Settings } from '@shared/settings';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ContextMenuProvider } from '../../../ui/ContextMenuProvider';
import type { ViewStore } from '../viewStore';
import Board from './Board';

const view: PublicView = {
  seq: 1,
  playerId: 'p1',
  name: 'You',
  life: 20,
  counters: {},
  mulligans: 0,
  keptHand: true,
  zones: { battlefield: [], graveyard: [], exile: [], command: [] },
  handCount: 7,
  libraryCount: 53,
  commanderDamage: [],
  dummies: [],
  turn: 3,
  phase: 'main1',
};

const opponent: OpponentState = {
  seq: 1,
  selfSeat: null,
  peers: [
    {
      info: { playerId: 'p2', name: 'Bob', appVersion: '0.0.0' },
      seat: null,
      view: { ...view, playerId: 'p2', name: 'Bob', turn: 5 },
    },
  ],
  log: [],
};

const storeOf = <V,>(value: V): ViewStore<V> => ({
  subscribe: () => () => {},
  getSnapshot: () => value,
});

const never = () => new Promise(() => {});
let pushSettings: (next: Settings) => void;

const renderBoard = (initial: Settings) => {
  Object.assign(window, {
    api: {
      getSettings: () => Promise.resolve(initial),
      onSettingsChanged: (listener: (next: Settings) => void) => {
        pushSettings = listener;
        return () => {};
      },
      getUndoState: never,
      onUndoState: () => () => {},
      getCommanderPrompts: never,
      onCommanderPrompts: () => () => {},
    },
  });
  render(
    <ContextMenuProvider>
      <Board store={storeOf(view)} opponent={storeOf(opponent)} />
    </ContextMenuProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
});

describe('Board turn tracking', () => {
  it('hides the turn panel and opponent turn by default', async () => {
    renderBoard(defaultSettings);
    await act(async () => {});
    expect(screen.queryByTestId('turn-panel')).toBeNull();
    expect(screen.queryByTestId('opponent-turn')).toBeNull();
    expect(screen.getByTestId('opponent-side')).toBeInTheDocument();
  });

  it('follows the setting live', async () => {
    renderBoard({ ...defaultSettings, turnTracking: true });
    expect(await screen.findByTestId('turn-panel')).toBeInTheDocument();
    expect(screen.getByTestId('turn')).toHaveTextContent('3');
    expect(screen.getByTestId('opponent-turn')).toHaveTextContent('Turn 5');

    act(() => pushSettings({ ...defaultSettings, turnTracking: false }));
    expect(screen.queryByTestId('turn-panel')).toBeNull();
    expect(screen.queryByTestId('opponent-turn')).toBeNull();

    act(() => pushSettings({ ...defaultSettings, turnTracking: true }));
    expect(screen.getByTestId('turn-panel')).toBeInTheDocument();
  });
});
