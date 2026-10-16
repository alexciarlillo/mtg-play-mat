import { type MoxfieldSyncStatus, parseMoxfieldUser } from '@shared/moxfield';
import { defaultSettings, type Settings as Values } from '@shared/settings';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from './Settings';

let saved: Values;
// Mimics main: a name is trimmed, and an address that is not http(s) is
// dropped rather than stored.
const clean = (patch: Partial<Values>): Partial<Values> => {
  const next = { ...patch };
  if (next.displayName) next.displayName = next.displayName.trim();
  if (next.relayUrl !== undefined) {
    const url = next.relayUrl.trim();
    if (url !== '' && !/^https?:\/\//.test(url)) delete next.relayUrl;
    else next.relayUrl = url;
  }
  return next;
};

const updateSettings = vi.fn((patch: Partial<Values>) => {
  saved = { ...saved, ...clean(patch) };
  return Promise.resolve(saved);
});

let moxfield: MoxfieldSyncStatus;
// Like main, keeps only the username from a profile link.
const syncMoxfield = vi.fn((user: string) =>
  Promise.resolve({
    ...moxfield,
    user: parseMoxfieldUser(user) ?? moxfield.user,
    running: true,
  })
);

beforeEach(() => {
  moxfield = {
    user: '',
    running: false,
    progress: null,
    lastSyncedAt: null,
    result: null,
    error: null,
  };
  syncMoxfield.mockClear();
  saved = { ...defaultSettings, displayName: 'Alice' };
  updateSettings.mockClear();
  Object.assign(window, {
    api: {
      getSettings: () => Promise.resolve(saved),
      onSettingsChanged: () => () => {},
      updateSettings,
      getMoxfieldSync: () => Promise.resolve(moxfield),
      onMoxfieldSync: () => () => {},
      syncMoxfield,
      cancelMoxfieldSync: vi.fn(() => Promise.resolve()),
    },
  });
});

describe('Settings', () => {
  it('saves the turn tracking toggle right away', async () => {
    render(<Settings />);
    const toggle = await screen.findByLabelText(/Track turns and phases/);
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(updateSettings).toHaveBeenCalledWith({ turnTracking: true });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('saves the display name and shows the stored version', async () => {
    render(<Settings />);
    const input = await screen.findByLabelText('Your name');
    expect(input).toHaveValue('Alice');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: ' Bob ' } });
    fireEvent.click(save);
    expect(updateSettings).toHaveBeenCalledWith({ displayName: ' Bob ' });
    await waitFor(() =>
      expect(screen.getByLabelText('Your name')).toHaveValue('Bob')
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the relay server and key together', async () => {
    render(<Settings />);
    const url = await screen.findByLabelText('Relay server');
    const key = screen.getByLabelText('Relay key');
    const save = screen.getByRole('button', { name: 'Save relay' });
    expect(url).toHaveValue('');
    expect(save).toBeDisabled();

    fireEvent.change(url, {
      target: { value: 'https://relay.example.com' },
    });
    fireEvent.change(key, { target: { value: 'secret' } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(updateSettings).toHaveBeenCalledWith({
      relayUrl: 'https://relay.example.com',
      relayKey: 'secret',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save relay' })).toBeDisabled()
    );
  });

  it('says so when the address was not a web address', async () => {
    render(<Settings />);
    const url = await screen.findByLabelText('Relay server');
    fireEvent.change(url, { target: { value: 'relay.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save relay' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'not an http:// or https:// address'
      )
    );
    expect(screen.getByLabelText('Relay server')).toHaveValue('');
  });

  it('syncs Moxfield decks and shows the last result', async () => {
    moxfield = {
      ...moxfield,
      user: 'ann',
      lastSyncedAt: '2026-10-15T10:00:00.000Z',
      result: {
        user: 'ann',
        finishedAt: '2026-10-15T10:00:00.000Z',
        counts: { added: 1, updated: 0, unchanged: 2, gone: 1, failed: 1 },
        complete: false,
        decks: [
          {
            publicId: 'a',
            name: 'Elves',
            outcome: 'added',
            unresolved: [
              {
                name: 'Bogus',
                qty: 2,
                board: 'main',
                reason: 'No card named "Bogus"',
              },
            ],
            notes: [
              '"Lurrus" is listed as the companion and in the sideboard.',
            ],
          },
          {
            publicId: 'b',
            name: 'Old',
            outcome: 'gone',
            unresolved: [],
            notes: [],
          },
          {
            publicId: 'c',
            name: 'Odd',
            outcome: 'failed',
            error: 'This deck is no longer public on Moxfield.',
            unresolved: [],
            notes: [],
          },
          {
            publicId: 'd',
            name: 'Same',
            outcome: 'unchanged',
            unresolved: [],
            notes: [],
          },
        ],
      },
    };
    saved = { ...saved, moxfieldUser: 'ann' };
    render(<Settings />);
    const field = await screen.findByLabelText('Moxfield user');
    expect(field).toHaveValue('ann');
    expect(screen.getByTestId('moxfield-status')).toHaveTextContent(
      'Last synced'
    );
    expect(screen.getByTestId('moxfield-result')).toHaveTextContent(
      '1 added · 0 updated · 2 unchanged · 1 no longer on Moxfield · 1 failed'
    );
    expect(screen.getByTestId('moxfield-incomplete')).toHaveTextContent(
      'no deck was marked as no longer on Moxfield'
    );
    const lines = screen.getAllByTestId('moxfield-result-line');
    expect(lines.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/without 2 Bogus.*\. "Lurrus" is listed/),
      expect.stringContaining('Old: no longer public'),
      expect.stringContaining('Odd: This deck is no longer public'),
    ]);

    fireEvent.change(field, {
      target: { value: 'https://moxfield.com/users/bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync decks' }));
    await waitFor(() =>
      expect(syncMoxfield).toHaveBeenCalledWith(
        'https://moxfield.com/users/bob'
      )
    );
    await waitFor(() => expect(field).toHaveValue('bob'));
  });
});
