import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TokenDialog from './TokenDialog';

const soldier = {
  id: '1bdb2914-bba2-4cb6-802e-af2aeef46de8',
  name: 'Soldier',
  typeLine: 'Token Creature — Soldier',
  faces: [{ name: 'Soldier', typeLine: 'Token Creature — Soldier' }],
  power: '1',
  toughness: '1',
};

const dispatch = vi.fn(() => Promise.resolve());
const searchTokens = vi.fn(() =>
  Promise.resolve([{ ref: soldier, setCode: 'tm21', setName: 'M21 Tokens' }])
);

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(window, { api: { dispatch, searchTokens } });
});

afterEach(() => {
  vi.useRealTimers();
  dispatch.mockClear();
  searchTokens.mockClear();
});

describe('TokenDialog', () => {
  it('searches token printings and creates N of the chosen one', async () => {
    const onClose = vi.fn();
    render(<TokenDialog playerId="p1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Token name'), {
      target: { value: 'sold' },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchTokens).toHaveBeenCalledWith('sold');

    fireEvent.click(screen.getByTestId('token-result'));
    fireEvent.change(screen.getByLabelText('How many?'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: soldier,
      count: 3,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a custom token with no image', () => {
    render(<TokenDialog playerId="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom token' }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Spirit ' },
    });
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'Token Creature — Spirit' },
    });
    fireEvent.click(create);

    const face = {
      name: 'Spirit',
      typeLine: 'Token Creature — Spirit',
      power: '1',
      toughness: '1',
    };
    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: { id: '', custom: true, ...face, faces: [face] },
      count: 1,
    });
  });
});
