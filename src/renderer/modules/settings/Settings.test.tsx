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

beforeEach(() => {
  saved = { ...defaultSettings, displayName: 'Alice' };
  updateSettings.mockClear();
  Object.assign(window, {
    api: {
      getSettings: () => Promise.resolve(saved),
      onSettingsChanged: () => () => {},
      updateSettings,
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
});
