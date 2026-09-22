import type { DebugSnapshot } from '@shared/debug';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DebugLogPanel from './DebugLogPanel';

const snapshot: DebugSnapshot = {
  env: {
    appVersion: '0.3.0',
    platform: 'darwin',
    relayHost: 'relay.example.com',
    relayKeySet: true,
  },
  entries: [
    {
      id: 1,
      at: new Date(2026, 8, 22, 9, 4, 5, 60).getTime(),
      level: 'info',
      scope: 'relay',
      text: 'dialling the relay',
      count: 1,
    },
    {
      id: 2,
      at: new Date(2026, 8, 22, 9, 4, 6, 0).getTime(),
      level: 'error',
      scope: 'relay',
      text: 'the relay refused us code=lobby_full',
      count: 3,
    },
  ],
};

const setup = () => {
  const api = {
    getDebugLog: vi.fn(async () => snapshot),
    onDebugLog: vi.fn(() => () => {}),
    clearDebugLog: vi.fn(async () => ({ ...snapshot, entries: [] })),
  };
  const writeText = vi.fn(async (_text: string) => {});
  vi.stubGlobal('api', api);
  // After userEvent, which installs a clipboard of its own.
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<DebugLogPanel />);
  return { api, writeText, user };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DebugLogPanel', () => {
  it('stays out of the way until it is asked for', async () => {
    const t = setup();
    await waitFor(() => expect(t.api.getDebugLog).toHaveBeenCalled());
    expect(screen.queryByTestId('debug-entries')).not.toBeInTheDocument();

    await t.user.click(screen.getByRole('button', { name: 'Show debug log' }));
    expect(screen.getByTestId('debug-env')).toHaveTextContent(
      'MTG Play Mat 0.3.0'
    );
  });

  it('shows what happened, newest last, with repeats counted', async () => {
    const t = setup();
    await t.user.click(screen.getByRole('button', { name: 'Show debug log' }));
    const lines = await screen.findAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('09:04:05.060 relay dialling the relay');
    expect(lines[1]).toHaveTextContent('the relay refused us code=lobby_full');
    expect(lines[1]).toHaveTextContent('×3');
  });

  it('copies the whole thing, header and all', async () => {
    const t = setup();
    await t.user.click(screen.getByRole('button', { name: 'Show debug log' }));
    await t.user.click(screen.getByRole('button', { name: 'Copy log' }));
    await waitFor(() => expect(t.writeText).toHaveBeenCalled());
    const copied = t.writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('relay.example.com (key set)');
    expect(copied).toContain('ERROR relay    the relay refused us');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('empties the log so a fresh attempt stands alone', async () => {
    const t = setup();
    await t.user.click(screen.getByRole('button', { name: 'Show debug log' }));
    await t.user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() =>
      expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
    );
    expect(t.api.clearDebugLog).toHaveBeenCalled();
  });
});
