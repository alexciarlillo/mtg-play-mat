import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SavedGamePrompt from './SavedGamePrompt';

const api = {
  restoreSavedGame: vi.fn(async () => {}),
  dismissSavedGame: vi.fn(async () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, { api });
});

const offer = {
  kind: 'restore' as const,
  deckName: 'Elves',
  savedAt: Date.UTC(2026, 9, 15, 12),
};

describe('SavedGamePrompt', () => {
  it('restores, with Restore focused', async () => {
    render(<SavedGamePrompt offer={offer} />);
    expect(screen.getByText(/saved game with Elves/)).toBeInTheDocument();
    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore).toHaveFocus();
    await userEvent.click(restore);
    expect(api.restoreSavedGame).toHaveBeenCalledTimes(1);
    expect(api.dismissSavedGame).not.toHaveBeenCalled();
  });

  it('keeps the new game', async () => {
    render(<SavedGamePrompt offer={offer} />);
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(api.dismissSavedGame).toHaveBeenCalledTimes(1);
    expect(api.restoreSavedGame).not.toHaveBeenCalled();
  });

  it('says why a restore was refused', () => {
    render(<SavedGamePrompt offer={{ ...offer, refused: 'Not now.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not now.');
  });

  it('explains a save it couldn’t use', async () => {
    render(
      <SavedGamePrompt offer={{ kind: 'failed', message: 'It broke.' }} />
    );
    expect(screen.getByTestId('saved-game-error')).toHaveTextContent(
      'It broke.'
    );
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(api.dismissSavedGame).toHaveBeenCalledTimes(1);
  });
});
