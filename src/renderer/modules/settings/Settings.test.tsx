import { defaultSettings, type Settings as Values } from '@shared/settings';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from './Settings';

let saved: Values;
const updateSettings = vi.fn((patch: Partial<Values>) => {
  // Mimics main, which trims the name before storing it.
  saved = {
    ...saved,
    ...patch,
    ...(patch.displayName && { displayName: patch.displayName.trim() }),
  };
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
});
